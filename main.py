import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from apscheduler.schedulers.background import BackgroundScheduler

import models
from database import engine, get_db, SessionLocal

# Crear tablas en la BD si no existen
models.Base.metadata.create_all(bind=engine)

# Configuración de seguridad
SECRET_KEY = os.getenv("SECRET_KEY", "clave_secreta_super_segura_devocionales_12345")
ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Si la clave en BD es directa de 4 dígitos o está hasheada
    if plain_password == hashed_password:
        return True
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ==========================================
# ESQUEMAS PYDANTIC
# ==========================================
class UserCreate(BaseModel):
    nombre: str
    password: str  # Representa el PIN de 4 dígitos
    telegram_id: Optional[str] = None
    rol: Optional[str] = "miembro"

class UserResponse(BaseModel):
    id: int
    nombre: str
    telegram_id: Optional[str] = None
    rol: str
    puntuacion_total: int

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    user_id: Optional[int] = None
    nombre: Optional[str] = None
    password: str

class QuestionCreate(BaseModel):
    devocional_id: int
    enunciado: str
    tipo: Optional[str] = "desarrollo"
    opciones: Optional[str] = None
    respuesta_correcta: Optional[str] = None

class QuestionResponse(QuestionCreate):
    id: int

    class Config:
        from_attributes = True

class DevotionalCreate(BaseModel):
    titulo: str
    resumen_ia: Optional[str] = None
    youtube_id: Optional[str] = None

class DevotionalResponse(DevotionalCreate):
    id: int
    fecha: datetime
    questions: List[QuestionResponse] = []

    class Config:
        from_attributes = True

class SingleAnswerSubmit(BaseModel):
    question_id: int
    respuesta_texto: str

class BatchAnswerSubmit(BaseModel):
    user_id: int
    respuestas: List[SingleAnswerSubmit]

class PendingReviewResponse(BaseModel):
    id: int
    usuario_id: int
    usuario_nombre: str
    devocional_titulo: Optional[str]
    enunciado: str
    respuesta_texto: str
    fecha_envio: datetime

class ReviewSubmit(BaseModel):
    respuesta_id: int
    evaluador_id: int
    aprobar: bool
    puntos_otorgados: int = 10
    feedback_pastor: Optional[str] = None

class RankingUser(BaseModel):
    posicion: int
    id: int
    nombre: str
    puntuacion_total: int


# ==========================================
# CICLO DE VIDA Y FASTAPI INIT
# ==========================================
scheduler = BackgroundScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(
    title="API Devocionales e Trivia",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# ENDPOINTS DE USUARIOS Y AUTENTICACIÓN
# ==========================================
@app.get("/usuarios", response_model=List[UserResponse])
def listar_usuarios(rol: Optional[str] = None, db: Session = Depends(get_db)):
    """Permite al frontend llenar los desplegables de Miembros o Pastores."""
    query = db.query(models.User)
    if rol:
        query = query.filter(models.User.rol == rol)
    return query.all()

@app.post("/registro", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@app.post("/usuarios/registro", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def registrar_usuario(user_data: UserCreate, db: Session = Depends(get_db)):
    nombre_clean = user_data.nombre.strip()

    usuario_existente = db.query(models.User).filter(models.User.nombre == nombre_clean).first()
    if usuario_existente:
        raise HTTPException(status_code=400, detail="El usuario ya se encuentra registrado.")

    nuevo_usuario = models.User(
        nombre=nombre_clean,
        password=get_password_hash(user_data.password),
        telegram_id=user_data.telegram_id,
        rol=user_data.rol if user_data.rol in ["miembro", "pastor"] else "miembro",
        puntuacion_total=0
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    return nuevo_usuario

@app.post("/login")
def iniciar_sesion(data: LoginRequest, db: Session = Depends(get_db)):
    usuario = None
    if data.user_id:
        usuario = db.query(models.User).filter(models.User.id == data.user_id).first()
    elif data.nombre:
        usuario = db.query(models.User).filter(models.User.nombre == data.nombre.strip()).first()

    if not usuario or not verify_password(data.password, usuario.password):
        raise HTTPException(status_code=401, detail="PIN o usuario incorrecto.")

    return {
        "mensaje": "Login exitoso",
        "usuario": {
            "id": usuario.id,
            "nombre": usuario.nombre,
            "rol": usuario.rol,
            "puntuacion_total": usuario.puntuacion_total
        }
    }


# ==========================================
# ENDPOINTS DEVOCIONALES Y PREGUNTAS
# ==========================================
@app.post("/pastor/devocionales", response_model=DevotionalResponse, status_code=status.HTTP_201_CREATED)
def crear_devocional(devocional_data: DevotionalCreate, db: Session = Depends(get_db)):
    nuevo_devocional = models.Devotional(
        titulo=devocional_data.titulo,
        resumen_ia=devocional_data.resumen_ia,
        youtube_id=devocional_data.youtube_id,
        fecha=datetime.now(timezone.utc)
    )
    db.add(nuevo_devocional)
    db.commit()
    db.refresh(nuevo_devocional)
    return nuevo_devocional

@app.get("/devocional/ultimo", response_model=DevotionalResponse)
def obtener_ultimo_devocional(db: Session = Depends(get_db)):
    devocional = db.query(models.Devotional).order_by(models.Devotional.fecha.desc()).first()
    if not devocional:
        raise HTTPException(status_code=404, detail="No hay devocionales registrados.")
    return devocional

@app.post("/pastor/preguntas", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def crear_pregunta(pregunta_data: QuestionCreate, db: Session = Depends(get_db)):
    devocional = db.query(models.Devotional).filter(models.Devotional.id == pregunta_data.devocional_id).first()
    if not devocional:
        raise HTTPException(status_code=404, detail="El devocional no existe.")

    nueva_pregunta = models.Question(
        devocional_id=pregunta_data.devocional_id,
        enunciado=pregunta_data.enunciado,
        tipo=pregunta_data.tipo,
        opciones=pregunta_data.opciones,
        respuesta_correcta=pregunta_data.respuesta_correcta
    )
    db.add(nueva_pregunta)
    db.commit()
    db.refresh(nueva_pregunta)
    return nueva_pregunta


# ==========================================
# RESPUESTAS Y EVALUACIÓN PASTORAL
# ==========================================
@app.post("/respuestas")
def enviar_respuestas(envio: BatchAnswerSubmit, db: Session = Depends(get_db)):
    usuario = db.query(models.User).filter(models.User.id == envio.user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    resultados = []
    puntos_inmediatos = 0

    for item in envio.respuestas:
        pregunta = db.query(models.Question).filter(models.Question.id == item.question_id).first()
        if not pregunta:
            continue

        existente = db.query(models.UserAnswer).filter(
            models.UserAnswer.user_id == usuario.id,
            models.UserAnswer.question_id == pregunta.id
        ).first()

        if existente:
            resultados.append({"question_id": pregunta.id, "estado": existente.estado, "mensaje": "Ya respondida."})
            continue

        texto_limpio = item.respuesta_texto.strip() if item.respuesta_texto else ""

        if pregunta.tipo in ["seleccion_simple", "v_f"] and pregunta.respuesta_correcta:
            char_resp = texto_limpio.upper()[0] if texto_limpio else ""
            char_corr = pregunta.respuesta_correcta.strip().upper()[0] if pregunta.respuesta_correcta else ""

            es_correcta = (char_resp == char_corr)
            puntos = 10 if es_correcta else 0
            estado_resp = "aprobada" if es_correcta else "rechazada"

            registro = models.UserAnswer(
                user_id=usuario.id,
                question_id=pregunta.id,
                respuesta_texto=texto_limpio,
                estado=estado_resp,
                puntos_otorgados=puntos,
                fecha_envio=datetime.now(timezone.utc)
            )

            if es_correcta:
                usuario.puntuacion_total += puntos
                puntos_inmediatos += puntos

        else:
            registro = models.UserAnswer(
                user_id=usuario.id,
                question_id=pregunta.id,
                respuesta_texto=texto_limpio,
                estado="pendiente",
                puntos_otorgados=0,
                fecha_envio=datetime.now(timezone.utc)
            )

        db.add(registro)

    db.commit()
    db.refresh(usuario)

    return {
        "puntuacion_total": usuario.puntuacion_total,
        "puntos_obtenidos_inmediatos": puntos_inmediatos,
        "detalles": resultados
    }

@app.get("/pastor/revisiones/pendientes", response_model=List[PendingReviewResponse])
def listar_respuestas_pendientes(db: Session = Depends(get_db)):
    pendientes = (
        db.query(models.UserAnswer)
        .join(models.Question)
        .filter(models.UserAnswer.estado == "pendiente")
        .all()
    )

    respuesta = []
    for item in pendientes:
        devocional_titulo = item.question.devotional.titulo if item.question.devotional else "General"
        respuesta.append(PendingReviewResponse(
            id=item.id,
            usuario_id=item.user_id,
            usuario_nombre=item.user.nombre,
            devocional_titulo=devocional_titulo,
            enunciado=item.question.enunciado,
            respuesta_texto=item.respuesta_texto,
            fecha_envio=item.fecha_envio
        ))

    return respuesta

@app.post("/pastor/revisiones/evaluar")
def evaluar_respuesta(evaluacion: ReviewSubmit, db: Session = Depends(get_db)):
    respuesta = db.query(models.UserAnswer).filter(models.UserAnswer.id == evaluacion.respuesta_id).first()
    if not respuesta:
        raise HTTPException(status_code=404, detail="Respuesta no encontrada.")

    nuevo_estado = "aprobada" if evaluacion.aprobar else "rechazada"
    puntos = evaluacion.puntos_otorgados if evaluacion.aprobar else 0

    respuesta.estado = nuevo_estado
    respuesta.puntos_otorgados = puntos
    respuesta.feedback_pastor = evaluacion.feedback_pastor
    respuesta.fecha_evaluacion = datetime.now(timezone.utc)
    respuesta.evaluado_por = evaluacion.evaluador_id

    if evaluacion.aprobar and puntos > 0:
        respuesta.user.puntuacion_total += puntos

    db.commit()
    return {"mensaje": "Evaluación guardada.", "estado": nuevo_estado, "puntos_otorgados": puntos}


# ==========================================
# RANKING / LEADERBOARD
# ==========================================
@app.get("/ranking", response_model=List[RankingUser])
def obtener_ranking(
    periodo: str = Query("historico", enum=["diario", "semanal", "historico"]),
    db: Session = Depends(get_db)
):
    if periodo == "historico":
        usuarios = (
            db.query(models.User)
            .order_by(models.User.puntuacion_total.desc())
            .limit(50)
            .all()
        )
        return [
            RankingUser(
                posicion=idx + 1,
                id=u.id,
                nombre=u.nombre,
                puntuacion_total=u.puntuacion_total
            ) for idx, u in enumerate(usuarios)
        ]

    ahora = datetime.now(timezone.utc)
    inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0) if periodo == "diario" else ahora - timedelta(days=7)

    ranking_query = (
        db.query(
            models.User.id,
            models.User.nombre,
            func.coalesce(func.sum(models.UserAnswer.puntos_otorgados), 0).label("puntos_periodo")
        )
        .join(models.UserAnswer, models.User.id == models.UserAnswer.user_id)
        .filter(models.UserAnswer.fecha_envio >= inicio)
        .filter(models.UserAnswer.estado == "aprobada")
        .group_by(models.User.id)
        .order_by(func.sum(models.UserAnswer.puntos_otorgados).desc())
        .limit(50)
        .all()
    )

    return [
        RankingUser(
            posicion=idx + 1,
            id=row.id,
            nombre=row.nombre,
            puntuacion_total=row.puntos_periodo
        ) for idx, row in enumerate(ranking_query)
    ]