import os
import json
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List
from apscheduler.schedulers.background import BackgroundScheduler

from database import engine, get_db, SessionLocal, Base
import models
import services

import traceback
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse


class DebugMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        try:
            return await call_next(request)
        except Exception as e:
            print("=" * 80)
            print("ERROR EN ENDPOINT:", request.url.path)
            print(traceback.format_exc())
            print("=" * 80)
            return JSONResponse(
                status_code=500,
                content={
                    "error": str(e),
                    "tipo": type(e).__name__,
                    "endpoint": request.url.path,
                    "traceback": traceback.format_exc().split("\n"),
                },
            )


# ════════════════════════════════════════════════════════════
# CONFIG TEMPORAL
# ════════════════════════════════════════════════════════════
TZ_CARACAS = ZoneInfo("America/Caracas")

PASTOR_NOMBRE = os.getenv("PASTOR_NOMBRE", "Pastor")
PASTOR_PIN = os.getenv("PASTOR_PIN", "1234")   # ⚠️ cámbialo por env var en Render
PASTOR_TELEGRAM_ID = os.getenv("PASTOR_TELEGRAM_ID")


def ahora_ve() -> datetime:
    """Hora actual en zona horaria de Venezuela."""
    return datetime.now(TZ_CARACAS)


# ════════════════════════════════════════════════════════════
# SEED: crear pastor si no existe (idempotente)
# ════════════════════════════════════════════════════════════
def seed_default_pastor() -> None:
    db = SessionLocal()
    try:
        existente = (
            db.query(models.User)
            .filter(models.User.rol == "pastor")
            .first()
        )
        if existente:
            print(f"[seed] Pastor ya existe: {existente.nombre} (id={existente.id})")
            return

        pastor = models.User(
            nombre=PASTOR_NOMBRE,
            telegram_id=PASTOR_TELEGRAM_ID,
            rol="pastor",
            puntuacion_total=0,
            pin_hash=services.hash_password(PASTOR_PIN),   # ← bcrypt
        )
        db.add(pastor)
        db.commit()
        db.refresh(pastor)
        print(f"[seed] ✅ Pastor creado: {pastor.nombre} (id={pastor.id})")
    except Exception as e:
        db.rollback()
        print(f"[seed] ❌ Error creando pastor: {e}")
        raise
    finally:
        db.close()


# ════════════════════════════════════════════════════════════
# PROCESAMIENTO DEL DEVOCIONAL DEL DÍA (idempotente)
# ════════════════════════════════════════════════════════════
def procesar_devocional_del_dia(db: Session) -> dict:
    """
    Función central IDEMPOTENTE. Puede llamarse N veces al día sin efectos.
    Retorna dict con estado:
      'ya_existe' | 'sin_video' | 'video_ya_usado' | 'creado' | 'error_gemini'
    """
    hoy_ve = ahora_ve().date()
    desde = datetime.combine(hoy_ve, datetime.min.time())
    hasta = desde + timedelta(days=1)

    # 1. ¿Ya existe devocional para HOY?
    existente_hoy = (
        db.query(models.Devotional)
        .filter(models.Devotional.fecha >= desde)
        .filter(models.Devotional.fecha < hasta)
        .first()
    )
    if existente_hoy:
        return {
            "estado": "ya_existe",
            "mensaje": f"Ya existe devocional para hoy ({hoy_ve}).",
            "devocional_id": existente_hoy.id,
            "titulo": existente_hoy.titulo,
        }

    # 2. Buscar video de HOY
    video = services.obtener_devocional_de_hoy()
    if not video:
        return {
            "estado": "sin_video",
            "mensaje": "Aún no se ha publicado el devocional de hoy. Se reintentará.",
        }

    # 3. ¿Ese youtube_id ya fue usado?
    existente_yt = (
        db.query(models.Devotional)
        .filter(models.Devotional.youtube_id == video.get("youtube_id"))
        .first()
    )
    if existente_yt:
        return {
            "estado": "video_ya_usado",
            "mensaje": f"El video ya fue registrado (devocional #{existente_yt.id}).",
            "devocional_id": existente_yt.id,
        }

    # 4. Crear devocional + preguntas (transacción atómica)
    try:
        nuevo = models.Devotional(
            titulo=video["titulo"],
            resumen_ia=f"Devocional basado en el video oficial: {video['link']}",
            fecha=hoy_ve,
            youtube_id=video.get("youtube_id"),
        )
        db.add(nuevo)
        db.flush()

        preguntas = services.generar_preguntas_con_gemini(video["titulo"])

        if not preguntas:
            raise ValueError("Gemini no devolvió preguntas (lista vacía).")

        for q in preguntas:
            db.add(models.Question(
                devocional_id=nuevo.id,
                enunciado=q.get("enunciado"),
                tipo=q.get("tipo", "desarrollo"),
                opciones=json.dumps(q.get("opciones", [])),
                respuesta_correcta=q.get("respuesta_correcta", ""),
            ))

        db.commit()
        db.refresh(nuevo)

        return {
            "estado": "creado",
            "devocional_id": nuevo.id,
            "titulo": nuevo.titulo,
            "link_video": video["link"],
            "preguntas_generadas": len(preguntas),
        }

    except Exception as e:
        db.rollback()
        print(f"❌ Error creando devocional del día: {e}")
        return {
            "estado": "error_gemini",
            "mensaje": f"Falló la generación de preguntas: {e}",
        }


# ════════════════════════════════════════════════════════════
# SCHEDULER
# ════════════════════════════════════════════════════════════
scheduler = BackgroundScheduler(timezone="America/Caracas")


def tarea_programada_devocional():
    """Job idempotente. Se ejecuta varias veces al día."""
    db = SessionLocal()
    try:
        resultado = procesar_devocional_del_dia(db)
        print(f"[cron] {resultado['estado']}: {resultado.get('mensaje', '')}")
    except Exception as e:
        print(f"❌ Error en cron de devocionales: {e}")
    finally:
        db.close()


# ════════════════════════════════════════════════════════════
# LIFESPAN
# ════════════════════════════════════════════════════════════
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    print("[lifespan] ✅ Tablas verificadas/creadas")

    try:
        seed_default_pastor()
    except Exception as e:
        print(f"[lifespan] ⚠️ No se pudo sembrar al pastor: {e}")

    scheduler.add_job(
        tarea_programada_devocional,
        trigger="cron",
        hour="6-22/2",
        minute=0,
        id="devocional_diario",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
        coalesce=True,
    )
    scheduler.start()
    print("[lifespan] ⏰ Scheduler iniciado (reintentos 6am-10pm America/Caracas)")

    yield

    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[lifespan] ⏰ Scheduler detenido")


# ════════════════════════════════════════════════════════════
# APP
# ════════════════════════════════════════════════════════════
app = FastAPI(title="Trivia Iglesia API", version="1.0", lifespan=lifespan)

app.add_middleware(DebugMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://bibliogramajjn.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Esquemas Pydantic ---
class UserCreate(BaseModel):
    nombre: str
    password: str          # El frontend sigue enviando "password" = PIN de 4 dígitos
    telegram_id: str = None
    rol: str = "miembro"   # Por seguridad siempre se creará como miembro por defecto


class UserLogin(BaseModel):
    user_id: int
    password: str          # El frontend sigue enviando "password" = PIN


class UserOut(BaseModel):
    """Respuesta pública de usuario: NUNCA incluye pin_hash."""
    id: int
    nombre: str
    rol: str
    puntuacion_total: int = 0
    telegram_id: str | None = None

    class Config:
        from_attributes = True


class AnswerItem(BaseModel):
    question_id: int
    respuesta_texto: str


class DevotionalAnswerSubmission(BaseModel):
    user_id: int
    respuestas: List[AnswerItem]


class PastorEvaluation(BaseModel):
    estado: str                 # "aprobada" o "rechazada"
    feedback: str = ""
    evaluado_por: int | None = None


# --- Ruta Principal ---
@app.get("/")
def read_root():
    return {"mensaje": "¡La API de la Trivia de la Iglesia está en línea y lista!"}


# --- Health check ---
@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# --- Endpoints de Autenticación ---
@app.post("/auth/login", summary="Login por ID de usuario y PIN")
def login_usuario(data: UserLogin, db: Session = Depends(get_db)):
    usuario = db.query(models.User).filter(models.User.id == data.user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    # Verificar PIN contra el hash bcrypt
    if not services.verify_password(data.password, usuario.pin_hash):
        raise HTTPException(status_code=401, detail="PIN incorrecto.")

    return {
        "mensaje": "Login exitoso",
        "usuario": {
            "id": usuario.id,
            "nombre": usuario.nombre,
            "rol": usuario.rol
        }
    }


# --- Endpoints de Devocionales ---
@app.api_route("/devocionales/generar-diario", methods=["GET", "POST"])
def generar_devocional_diario(db: Session = Depends(get_db)):
    """
    Idempotente: si ya existe devocional para HOY, no crea otro.
    """
    return procesar_devocional_del_dia(db)


@app.get("/devocionales/activo", summary="Obtener el devocional de HOY con preguntas")
def obtener_devocional_activo(usuario_id: int, db: Session = Depends(get_db)):
    hoy_ve = ahora_ve().date()
    desde = datetime.combine(hoy_ve, datetime.min.time())
    hasta = desde + timedelta(days=1)
    devocional = (
        db.query(models.Devotional)
        .filter(models.Devotional.fecha >= desde)
        .filter(models.Devotional.fecha < hasta)
        .first()
    )

    if not devocional:
        raise HTTPException(
            status_code=404,
            detail="Aún no se ha publicado el devocional de hoy. Vuelve más tarde."
        )

    preguntas_ids = [q.id for q in devocional.questions]
    ya_respondido = False

    if preguntas_ids:
        respuestas_existentes = db.query(models.UserAnswer).filter(
            models.UserAnswer.user_id == usuario_id,
            models.UserAnswer.question_id.in_(preguntas_ids)
        ).first()
        if respuestas_existentes:
            ya_respondido = True

    preguntas_data = []
    for q in devocional.questions:
        opciones = json.loads(q.opciones) if q.opciones else []
        preguntas_data.append({
            "id": q.id,
            "enunciado": q.enunciado,
            "tipo": q.tipo,
            "opciones": opciones
        })

    return {
        "devocional_id": devocional.id,
        "titulo": devocional.titulo,
        "resumen_ia": devocional.resumen_ia,
        "fecha": str(devocional.fecha),
        "ya_respondido": ya_respondido,
        "preguntas": preguntas_data
    }


# --- Endpoints de Usuarios ---
@app.post("/usuarios", summary="Registrar un nuevo miembro con PIN de 4 dígitos")
def crear_usuario(user: UserCreate, db: Session = Depends(get_db)):
    # Validar PIN: 4 dígitos numéricos
    if not user.password.isdigit() or len(user.password) != 4:
        raise HTTPException(
            status_code=422,
            detail="El PIN debe tener exactamente 4 dígitos numéricos."
        )

    # Verificar duplicado (case-insensitive)
    existente = db.query(models.User).filter(
        func.lower(models.User.nombre) == user.nombre.strip().lower()
    ).first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail="Ya existe un usuario con ese nombre. Si eres tú, contacta al pastor."
        )

    nuevo_usuario = models.User(
        nombre=user.nombre.strip(),
        telegram_id=user.telegram_id,
        rol="miembro",
        puntuacion_total=0,
        pin_hash=services.hash_password(user.password),   # ← bcrypt
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    return {
        "mensaje": "¡Usuario registrado con éxito!",
        "usuario": {
            "id": nuevo_usuario.id,
            "nombre": nuevo_usuario.nombre,
            "rol": nuevo_usuario.rol
        }
    }


@app.get("/usuarios", response_model=list[UserOut], summary="Listar todos los usuarios registrados (admin)")
def listar_usuarios(db: Session = Depends(get_db)):
    return db.query(models.User).all()


@app.get("/usuarios/miembros", response_model=list[UserOut], summary="Listar solo miembros (para login de miembros)")
def listar_miembros(db: Session = Depends(get_db)):
    return (
        db.query(models.User)
        .filter(models.User.rol == "miembro")
        .order_by(models.User.nombre)
        .all()
    )


@app.get("/usuarios/pastores", response_model=list[UserOut], summary="Listar solo pastores (para login pastoral)")
def listar_pastores(db: Session = Depends(get_db)):
    return (
        db.query(models.User)
        .filter(models.User.rol == "pastor")
        .order_by(models.User.nombre)
        .all()
    )


# --- Endpoints de Gestión de Usuarios (Pastor) ---
@app.get("/pastor/usuarios", summary="Listar usuarios (sin PIN) para panel del pastor")
def listar_usuarios_admin(db: Session = Depends(get_db)):
    usuarios = db.query(models.User).order_by(models.User.nombre).all()
    return [
        {
            "id": u.id,
            "nombre": u.nombre,
            "rol": u.rol,
            "puntuacion_total": u.puntuacion_total or 0,
        }
        for u in usuarios
    ]


@app.post("/pastor/usuarios/{user_id}/reset-pin", summary="Generar un nuevo PIN para un usuario")
def resetear_pin(user_id: int, db: Session = Depends(get_db)):
    usuario = db.query(models.User).filter(models.User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    nuevo_pin = services.generar_pin_aleatorio()
    usuario.pin_hash = services.hash_password(nuevo_pin)   # ← guardar hash
    db.commit()

    return {
        "mensaje": f"PIN reseteado para {usuario.nombre}. Anótalo, no se volverá a mostrar.",
        "usuario_id": usuario.id,
        "nombre": usuario.nombre,
        "nuevo_pin": nuevo_pin,   # única vez que se ve en claro
    }


# --- Endpoints de Ranking ---
@app.get("/ranking", summary="Ranking por período (diario, semanal, mensual, total)")
def obtener_ranking(periodo: str = "total", db: Session = Depends(get_db)):
    hoy = ahora_ve().date()

    if periodo == "diario":
        desde = datetime.combine(hoy, datetime.min.time())
        titulo = f"Hoy · {hoy.isoformat()}"
    elif periodo == "semanal":
        desde = datetime.combine(hoy - timedelta(days=hoy.weekday()), datetime.min.time())
        titulo = f"Semana del {desde.date().isoformat()}"
    elif periodo == "mensual":
        desde = datetime.combine(hoy.replace(day=1), datetime.min.time())
        titulo = f"{hoy.strftime('%B %Y').capitalize()}"
    else:
        desde = None
        titulo = "Ranking general"
        periodo = "total"

    query = (
        db.query(
            models.User.id,
            models.User.nombre,
            models.User.rol,
            func.coalesce(func.sum(models.UserAnswer.puntos_otorgados), 0).label("puntos")
        )
        .outerjoin(
            models.UserAnswer,
            models.UserAnswer.user_id == models.User.id
        )
        .filter(models.User.rol == "miembro")
    )

    if desde is not None:
        query = query.filter(models.UserAnswer.fecha_envio >= desde)

    query = (
        query
        .group_by(models.User.id)
        .order_by(func.coalesce(func.sum(models.UserAnswer.puntos_otorgados), 0).desc())
    )

    resultados = query.all()

    ranking_list = []
    for posicion, (uid, nombre, rol, puntos) in enumerate(resultados, start=1):
        ranking_list.append({
            "puesto": posicion,
            "usuario_id": uid,
            "nombre": nombre,
            "rol": rol,
            "puntuacion_total": puntos or 0
        })

    return {
        "estado": "¡Éxito!",
        "periodo": periodo,
        "titulo": titulo,
        "desde": desde.isoformat() if desde else None,
        "ranking": ranking_list
    }


# --- Endpoints de Respuestas y Evaluación ---
@app.post("/respuestas", summary="Enviar respuestas a la trivia de un devocional")
def responder_devocional(submission: DevotionalAnswerSubmission, db: Session = Depends(get_db)):
    usuario = db.query(models.User).filter(models.User.id == submission.user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if usuario.rol == "pastor":
        raise HTTPException(
            status_code=403,
            detail="Los pastores no participan en los devocionales como miembros."
        )

    resultados_evaluacion = []
    puntos_ganados_total = 0

    for item in submission.respuestas:
        pregunta = db.query(models.Question).filter(models.Question.id == item.question_id).first()
        if not pregunta:
            continue

        estado = "pendiente"
        puntos_otorgados = 0

        if pregunta.tipo == "seleccion_simple":
            respuesta_limpia = item.respuesta_texto.strip().upper()[0] if item.respuesta_texto else ""
            correcta_limpia = pregunta.respuesta_correcta.strip().upper()[0] if pregunta.respuesta_correcta else ""

            if respuesta_limpia == correcta_limpia:
                estado = "aprobada"
                puntos_otorgados = 10
                puntos_ganados_total += puntos_otorgados
            else:
                estado = "rechazada"
                puntos_otorgados = 0
        else:
            estado = "pendiente"
            puntos_otorgados = 0

        nueva_respuesta = models.UserAnswer(
            user_id=usuario.id,
            question_id=pregunta.id,
            respuesta_texto=item.respuesta_texto,
            estado=estado,
            puntos_otorgados=puntos_otorgados
        )
        db.add(nueva_respuesta)

        resultados_evaluacion.append({
            "question_id": pregunta.id,
            "enunciado": pregunta.enunciado,
            "respuesta_enviada": item.respuesta_texto,
            "tipo": pregunta.tipo,
            "estado": estado,
            "puntos_otorgados": puntos_otorgados
        })

    if puntos_ganados_total > 0:
        usuario.puntuacion_total += puntos_ganados_total

    db.commit()

    return {
        "mensaje": "Respuestas procesadas correctamente.",
        "usuario": usuario.nombre,
        "puntos_obtenidos_en_intento": puntos_ganados_total,
        "puntuacion_total_acumulada": usuario.puntuacion_total,
        "detalle_respuestas": resultados_evaluacion
    }


# --- Endpoints del Pastor ---
@app.get("/respuestas/pendientes", summary="Ver todas las respuestas pendientes de revisión")
def ver_respuestas_pendientes(db: Session = Depends(get_db)):
    respuestas_pendientes = (
        db.query(models.UserAnswer)
        .filter(models.UserAnswer.estado == "pendiente")
        .order_by(models.UserAnswer.fecha_envio.asc())
        .all()
    )

    lista_pendientes = []
    for r in respuestas_pendientes:
        usuario = db.query(models.User).filter(models.User.id == r.user_id).first()
        pregunta = db.query(models.Question).filter(models.Question.id == r.question_id).first()
        devocional = (
            db.query(models.Devotional).filter(models.Devotional.id == pregunta.devocional_id).first()
            if pregunta else None
        )

        lista_pendientes.append({
            "answer_id": r.id,
            "user_id": r.user_id,
            "usuario_id": r.user_id,
            "nombre_usuario": usuario.nombre if usuario else "Desconocido",
            "devocional_id": devocional.id if devocional else None,
            "devocional_titulo": devocional.titulo if devocional else "Desconocido",
            "pregunta_id": r.question_id,
            "tipo_pregunta": pregunta.tipo if pregunta else "desconocido",
            "pregunta_texto": pregunta.enunciado if pregunta else "Desconocido",
            "enunciado": pregunta.enunciado if pregunta else "Desconocido",
            "respuesta_texto": r.respuesta_texto,
            "respuesta_enviada": r.respuesta_texto,
            "estado": r.estado,
            "fecha_envio": r.fecha_envio.isoformat() if r.fecha_envio else None,
        })

    return {
        "total_pendientes": len(lista_pendientes),
        "respuestas": lista_pendientes
    }


@app.post("/respuestas/{answer_id}/calificar", summary="Evaluar una respuesta individual")
def evaluar_respuesta_pastor(
    answer_id: int,
    evaluacion: PastorEvaluation,
    db: Session = Depends(get_db)
):
    answer = db.query(models.UserAnswer).filter(models.UserAnswer.id == answer_id).first()
    if not answer:
        raise HTTPException(status_code=404, detail="Respuesta no encontrada.")

    if answer.estado != "pendiente":
        raise HTTPException(status_code=400, detail="Esta respuesta ya fue evaluada anteriormente.")

    estado_raw = (evaluacion.estado or "").strip().lower()
    if estado_raw in ("correcto", "aprobada", "aprobado", "ok"):
        estado_final = "aprobada"
    elif estado_raw in ("incorrecto", "rechazada", "rechazado"):
        estado_final = "rechazada"
    else:
        raise HTTPException(
            status_code=422,
            detail=f"Estado inválido: '{evaluacion.estado}'. Use 'correcto'/'incorrecto' o 'aprobada'/'rechazada'."
        )

    puntos = 10 if estado_final == "aprobada" else 0

    answer.estado = estado_final
    answer.puntos_otorgados = puntos
    answer.feedback_pastor = evaluacion.feedback or None
    answer.fecha_evaluacion = datetime.utcnow()
    answer.evaluado_por = evaluacion.evaluado_por

    if puntos > 0:
        usuario = db.query(models.User).filter(models.User.id == answer.user_id).first()
        if usuario:
            usuario.puntuacion_total += puntos

    db.commit()
    db.refresh(answer)

    return {
        "mensaje": "Respuesta evaluada exitosamente.",
        "answer_id": answer.id,
        "user_id": answer.user_id,
        "nuevo_estado": answer.estado,
        "puntos_otorgados": answer.puntos_otorgados,
        "feedback": answer.feedback_pastor,
        "fecha_evaluacion": answer.fecha_evaluacion.isoformat() if answer.fecha_evaluacion else None
    }


@app.get(
    "/miembros/{user_id}/respuestas/{devocional_id}",
    summary="Obtener las respuestas de un miembro para un devocional, con feedback pastoral"
)
def obtener_respuestas_miembro(
    user_id: int,
    devocional_id: int,
    db: Session = Depends(get_db)
):
    usuario = db.query(models.User).filter(models.User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    devocional = db.query(models.Devotional).filter(models.Devotional.id == devocional_id).first()
    if not devocional:
        raise HTTPException(status_code=404, detail="Devocional no encontrado.")

    preguntas = db.query(models.Question).filter(models.Question.devocional_id == devocional_id).all()
    preguntas_ids = [q.id for q in preguntas]

    respuestas = (
        db.query(models.UserAnswer)
        .filter(
            models.UserAnswer.user_id == user_id,
            models.UserAnswer.question_id.in_(preguntas_ids)
        )
        .all()
    )

    respuestas_map = {r.question_id: r for r in respuestas}

    detalle = []
    total_puntos = 0
    aprobadas = 0
    rechazadas = 0
    pendientes = 0

    for idx, q in enumerate(preguntas, start=1):
        r = respuestas_map.get(q.id)
        if not r:
            detalle.append({
                "orden": idx,
                "pregunta_id": q.id,
                "pregunta_texto": q.enunciado,
                "tipo_pregunta": q.tipo,
                "respuesta_texto": None,
                "estado": "sin_responder",
                "puntos_otorgados": 0,
                "feedback_pastor": None,
                "fecha_envio": None,
                "fecha_evaluacion": None,
            })
            continue

        total_puntos += r.puntos_otorgados or 0
        if r.estado == "aprobada":
            aprobadas += 1
        elif r.estado == "rechazada":
            rechazadas += 1
        else:
            pendientes += 1

        detalle.append({
            "orden": idx,
            "pregunta_id": q.id,
            "pregunta_texto": q.enunciado,
            "tipo_pregunta": q.tipo,
            "respuesta_texto": r.respuesta_texto,
            "estado": r.estado,
            "puntos_otorgados": r.puntos_otorgados or 0,
            "feedback_pastor": r.feedback_pastor,
            "fecha_envio": r.fecha_envio.isoformat() if r.fecha_envio else None,
            "fecha_evaluacion": r.fecha_evaluacion.isoformat() if r.fecha_evaluacion else None,
        })

    return {
        "user_id": user_id,
        "nombre_usuario": usuario.nombre,
        "devocional_id": devocional_id,
        "devocional_titulo": devocional.titulo,
        "devocional_fecha": str(devocional.fecha),
        "resumen": {
            "total_preguntas": len(preguntas),
            "aprobadas": aprobadas,
            "rechazadas": rechazadas,
            "pendientes": pendientes,
            "puntos_totales": total_puntos,
        },
        "respuestas": detalle
    }