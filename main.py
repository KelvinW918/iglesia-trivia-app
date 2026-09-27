import json
from datetime import date, datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List
from database import engine, get_db
import models
import services
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

# Crea las tablas automáticamente en SQLite al iniciar
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Trivia Iglesia API", version="1.0")

# Configurar CORS: local + Render + dominios de producción
# NOTA: Cambia/amplía esta lista cuando tengas el dominio final del frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://bibliogramajjn.vercel.app",  # ← tu URL de Render (ajústala si cambia)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Función que se ejecutará automáticamente todos los días
def tarea_programada_devocional():
    db = next(get_db())
    try:
        print(f"[{datetime.now()}] Ejecutando generador automático de devocional diario...")
        video = services.obtener_ultimo_video_youtube()
        if not video:
            print("No se encontró video nuevo en YouTube.")
            return

        existente = db.query(models.Devotional).filter(models.Devotional.titulo == video["titulo"]).first()
        if existente:
            print("El devocional de este video ya existe en la base de datos.")
            return

        nuevo_devocional = models.Devotional(
            titulo=video["titulo"],
            resumen_ia=f"Devocional basado en el video oficial: {video['link']}",
            fecha=date.today()
        )
        db.add(nuevo_devocional)
        db.commit()
        db.refresh(nuevo_devocional)

        preguntas_json = services.generar_preguntas_con_gemini(video["titulo"])
        for q_data in preguntas_json:
            opciones_str = json.dumps(q_data.get("opciones", []))
            nueva_q = models.Question(
                devocional_id=nuevo_devocional.id,
                enunciado=q_data.get("enunciado"),
                tipo=q_data.get("tipo", "desarrollo"),
                opciones=opciones_str,
                respuesta_correcta=q_data.get("respuesta_correcta", "")
            )
            db.add(nueva_q)
        db.commit()
        print("¡Devocional diario generado y publicado con éxito para toda la comunidad!")
    except Exception as e:
        print(f"Error en la tarea automática de devocionales: {e}")
    finally:
        db.close()

# Configurar el planificador para que corra todos los días a las 06:00 AM
# NOTA: En Render el scheduler solo corre si el servicio está despierto.
# UptimeRobot se encargará de mantenerlo despierto + llamar al endpoint.
scheduler = BackgroundScheduler()
scheduler.add_job(tarea_programada_devocional, 'cron', hour=6, minute=0)
scheduler.start()

# --- Esquemas Pydantic para validación de entrada ---
class UserCreate(BaseModel):
    nombre: str
    password: str          # PIN de 4 dígitos creado por el usuario
    telegram_id: str = None
    rol: str = "miembro"   # Por seguridad siempre se creará como miembro por defecto

class UserLogin(BaseModel):
    user_id: int
    password: str

class AnswerItem(BaseModel):
    question_id: int
    respuesta_texto: str

class DevotionalAnswerSubmission(BaseModel):
    user_id: int
    respuestas: List[AnswerItem]

class PastorEvaluation(BaseModel):
    estado: str                 # "aprobada" o "rechazada"  (acepta también "correcto"/"incorrecto")
    feedback: str = ""
    evaluado_por: int | None = None

# --- Ruta Principal ---
@app.get("/")
def read_root():
    return {"mensaje": "¡La API de la Trivia de la Iglesia está en línea y lista!"}

# --- Health check para UptimeRobot (ligero, sin lógica) ---
@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

# --- Endpoints de Autenticación ---
@app.post("/auth/login", summary="Login por ID de usuario y PIN")
def login_usuario(data: UserLogin, db: Session = Depends(get_db)):
    usuario = db.query(models.User).filter(models.User.id == data.user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    # Comparar contra el PIN individual del usuario
    if usuario.password != data.password:
        raise HTTPException(status_code=401, detail="PIN incorrecto.")

    return {
        "mensaje": "Login exitoso",
        "usuario": {
            "id": usuario.id,
            "nombre": usuario.nombre,
            "rol": usuario.rol
        }
    }

# --- Endpoints de Devocionales y Generación con IA ---
@app.api_route("/devocionales/generar-diario", methods=["GET", "POST"])
def generar_devocional_diario(db: Session = Depends(get_db)):
    """
    Ruta para extraer el último video de YouTube y generar automáticamente
    las preguntas estructuradas con Gemini.

    Es IDEMPOTENTE: si ya existe un devocional para HOY, no crea otro.
    Esto permite que UptimeRobot u otro cron lo llame múltiples veces al día
    sin efectos secundarios.

    Acepta GET y POST para compatibilidad con UptimeRobot (que usa GET).
    """
    hoy = date.today()

    # 1. Verificar si ya existe un devocional para HOY
    existente_hoy = db.query(models.Devotional).filter(
        models.Devotional.fecha == hoy
    ).first()
    if existente_hoy:
        return {
            "estado": "ya_existe",
            "mensaje": f"Ya existe un devocional para hoy ({hoy}). No se crea otro.",
            "devocional_id": existente_hoy.id,
            "titulo": existente_hoy.titulo
        }

    # 2. Buscar video nuevo
    video = services.obtener_ultimo_video_youtube()
    if not video:
        return {
            "estado": "sin_video",
            "mensaje": "No se encontró video nuevo en YouTube. Se reintentará más tarde."
        }

    # 3. Verificar que el video no haya sido usado antes (por si acaso)
    existente_titulo = db.query(models.Devotional).filter(
        models.Devotional.titulo == video["titulo"]
    ).first()
    if existente_titulo:
        return {
            "estado": "video_ya_usado",
            "mensaje": f"El video '{video['titulo']}' ya fue registrado en otro devocional.",
            "devocional_id": existente_titulo.id
        }

    # 4. Crear devocional
    nuevo_devocional = models.Devotional(
        titulo=video["titulo"],
        resumen_ia=f"Devocional basado en el video oficial: {video['link']}",
        fecha=hoy
    )
    db.add(nuevo_devocional)
    db.commit()
    db.refresh(nuevo_devocional)

    preguntas_json = services.generar_preguntas_con_gemini(video["titulo"])
    preguntas_creadas = []

    for q_data in preguntas_json:
        opciones_str = json.dumps(q_data.get("opciones", []))
        nueva_q = models.Question(
            devocional_id=nuevo_devocional.id,
            enunciado=q_data.get("enunciado"),
            tipo=q_data.get("tipo", "desarrollo"),
            opciones=opciones_str,
            respuesta_correcta=q_data.get("respuesta_correcta", "")
        )
        db.add(nueva_q)
        preguntas_creadas.append({
            "tipo": q_data.get("tipo"),
            "enunciado": q_data.get("enunciado"),
            "opciones": q_data.get("opciones", []),
            "respuesta_correcta": q_data.get("respuesta_correcta")
        })

    db.commit()
    return {
        "estado": "creado",
        "devocional": video["titulo"],
        "link_video": video["link"],
        "preguntas_generadas": preguntas_creadas
    }

@app.get("/devocionales/activo", summary="Obtener el devocional activo más reciente con preguntas")
def obtener_devocional_activo(usuario_id: int, db: Session = Depends(get_db)):
    # Buscamos directamente el último devocional creado para evitar problemas de desfase con la fecha
    devocional = db.query(models.Devotional).order_by(models.Devotional.id.desc()).first()

    if not devocional:
        raise HTTPException(status_code=404, detail="Aún no hay devocionales publicados en el sistema.")

    # Verificar de forma robusta si este usuario ya respondió alguna pregunta de este devocional
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
    # Validar que el PIN sean 4 dígitos numéricos
    if not user.password.isdigit() or len(user.password) != 4:
        raise HTTPException(
            status_code=422,
            detail="El PIN debe tener exactamente 4 dígitos numéricos."
        )

    # Verificar que no exista un usuario con el mismo nombre (case-insensitive)
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
        password=user.password
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

@app.get("/usuarios", summary="Listar todos los usuarios registrados (admin)")
def listar_usuarios(db: Session = Depends(get_db)):
    usuarios = db.query(models.User).all()
    return usuarios

@app.get("/usuarios/miembros", summary="Listar solo miembros (para login de miembros)")
def listar_miembros(db: Session = Depends(get_db)):
    return (
        db.query(models.User)
        .filter(models.User.rol == "miembro")
        .order_by(models.User.nombre)
        .all()
    )

@app.get("/usuarios/pastores", summary="Listar solo pastores (para login pastoral)")
def listar_pastores(db: Session = Depends(get_db)):
    return (
        db.query(models.User)
        .filter(models.User.rol == "pastor")
        .order_by(models.User.nombre)
        .all()
    )

# --- Endpoints de Gestión de Usuarios (Pastor) ---
@app.get("/pastor/usuarios", summary="Listar usuarios con sus PINs (para panel del pastor)")
def listar_usuarios_admin(db: Session = Depends(get_db)):
    usuarios = db.query(models.User).order_by(models.User.nombre).all()
    return [
        {
            "id": u.id,
            "nombre": u.nombre,
            "rol": u.rol,
            "password": u.password,
            "puntuacion_total": u.puntuacion_total or 0
        }
        for u in usuarios
    ]

@app.post("/pastor/usuarios/{user_id}/reset-pin", summary="Generar un nuevo PIN para un usuario")
def resetear_pin(user_id: int, db: Session = Depends(get_db)):
    import random
    usuario = db.query(models.User).filter(models.User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    nuevo_pin = str(random.randint(1000, 9999))
    usuario.password = nuevo_pin
    db.commit()

    return {
        "mensaje": f"PIN reseteado para {usuario.nombre}.",
        "usuario_id": usuario.id,
        "nombre": usuario.nombre,
        "nuevo_pin": nuevo_pin
    }

# --- Endpoints de Ranking / Leaderboard ---
@app.get("/ranking", summary="Ranking por período (diario, semanal, mensual, total)")
def obtener_ranking(periodo: str = "total", db: Session = Depends(get_db)):
    """
    Devuelve el ranking de miembros según el período solicitado.

    - `diario`: puntos ganados hoy (desde las 00:00 de hoy)
    - `semanal`: puntos ganados desde el lunes de esta semana
    - `mensual`: puntos ganados desde el primer día del mes actual
    - `total`: acumulado histórico (comportamiento original)

    Solo se incluyen usuarios con rol "miembro".
    """
    hoy = date.today()

    # Determinar la fecha de corte según el período
    if periodo == "diario":
        desde = datetime.combine(hoy, datetime.min.time())
        titulo = f"Hoy · {hoy.isoformat()}"
    elif periodo == "semanal":
        desde = datetime.combine(hoy - timedelta(days=hoy.weekday()), datetime.min.time())
        titulo = f"Semana del {desde.date().isoformat()}"
    elif periodo == "mensual":
        desde = datetime.combine(hoy.replace(day=1), datetime.min.time())
        titulo = f"{hoy.strftime('%B %Y').capitalize()}"
    else:  # "total" o cualquier valor no reconocido
        desde = None
        titulo = "Ranking general"
        periodo = "total"

    # Query base: miembros con suma de puntos
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

    # Filtrar por fecha de envío si aplica
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

    # Bloquear que un pastor responda devocionales como miembro
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

# --- Endpoints del Pastor (Revisión y Evaluación por respuesta) ---

@app.get("/respuestas/pendientes", summary="Ver todas las respuestas pendientes de revisión")
def ver_respuestas_pendientes(db: Session = Depends(get_db)):
    """
    Devuelve las respuestas pendientes en un formato plano y alineado con el frontend.
    Cada ítem representa UNA respuesta (answer) y se evalúa individualmente.
    """
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
            # Identificadores
            "answer_id": r.id,
            "user_id": r.user_id,
            "usuario_id": r.user_id,          # alias por compatibilidad
            "nombre_usuario": usuario.nombre if usuario else "Desconocido",
            # Devocional
            "devocional_id": devocional.id if devocional else None,
            "devocional_titulo": devocional.titulo if devocional else "Desconocido",
            # Pregunta
            "pregunta_id": r.question_id,
            "tipo_pregunta": pregunta.tipo if pregunta else "desconocido",
            "pregunta_texto": pregunta.enunciado if pregunta else "Desconocido",
            "enunciado": pregunta.enunciado if pregunta else "Desconocido",   # alias
            # Respuesta
            "respuesta_texto": r.respuesta_texto,
            "respuesta_enviada": r.respuesta_texto,                          # alias
            # Estado y fechas
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

    # Normalizar el estado recibido desde el frontend
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

    # Puntos: aprobada = 10 (consistente con seleccion_simple). Ajustable si luego quieres libre.
    puntos = 10 if estado_final == "aprobada" else 0

    answer.estado = estado_final
    answer.puntos_otorgados = puntos
    answer.feedback_pastor = evaluacion.feedback or None
    answer.fecha_evaluacion = datetime.utcnow()
    answer.evaluado_por = evaluacion.evaluado_por

    # Sumar puntos al usuario si aprobó
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
    """
    Devuelve todas las respuestas de un miembro para un devocional específico,
    incluyendo el estado de evaluación y el feedback pastoral si ya fue evaluada.
    """
    usuario = db.query(models.User).filter(models.User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    devocional = db.query(models.Devotional).filter(models.Devotional.id == devocional_id).first()
    if not devocional:
        raise HTTPException(status_code=404, detail="Devocional no encontrado.")

    # Traer todas las respuestas del miembro para las preguntas de este devocional
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

    # Mapear por question_id para asociar rápido
    respuestas_map = {r.question_id: r for r in respuestas}

    detalle = []
    total_puntos = 0
    aprobadas = 0
    rechazadas = 0
    pendientes = 0

    for idx, q in enumerate(preguntas, start=1):
        r = respuestas_map.get(q.id)
        if not r:
            # El miembro no respondió esta pregunta (no debería pasar, pero por si acaso)
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