import os
import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Union

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from apscheduler.schedulers.background import BackgroundScheduler

import models
from database import engine, get_db, SessionLocal

# Crear tablas en la BD si no existen
models.Base.metadata.create_all(bind=engine)

# ==========================================
# CONFIGURACIÓN DE SEGURIDAD Y JWT
# ==========================================
SECRET_KEY = os.getenv("SECRET_KEY", "clave_secreta_super_segura_devocionales_12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 días

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales de autenticación.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user

def require_pastor(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.rol not in ["pastor", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren privilegios de pastor o administrador para realizar esta acción."
        )
    return current_user


# ==========================================
# ESQUEMAS PYDANTIC (Alineados con models.py)
# ==========================================
class UserCreate(BaseModel):
    nombre: str
    password: str
    telegram_id: Optional[str] = None
    rol: Optional[str] = "miembro"  # "miembro" o "pastor"

class UserResponse(BaseModel):
    id: int
    nombre: str
    telegram_id: Optional[str] = None
    rol: str
    puntuacion_total: int

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class QuestionCreate(BaseModel):
    devocional_id: int
    enunciado: str
    tipo: Optional[str] = "desarrollo"  # "desarrollo", "seleccion_simple", "v_f"
    opciones: Optional[str] = None  # Puede ser un String JSON o texto separado por comas
    respuesta_correcta: Optional[str] = None

class QuestionResponse(QuestionCreate):
    id: int

    class Config:
        from_attributes = True

class QuestionResponseForUser(BaseModel):
    id: int
    devocional_id: int
    enunciado: str
    tipo: str
    opciones: Optional[str] = None

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

class DevotionalUserResponse(DevotionalCreate):
    id: int
    fecha: datetime
    questions: List[QuestionResponseForUser] = []

    class Config:
        from_attributes = True

class SingleAnswerSubmit(BaseModel):
    question_id: int
    respuesta_texto: str

class BatchAnswerSubmit(BaseModel):
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
    aprobar: bool
    puntos_otorgados: int = 10
    feedback_pastor: Optional[str] = None

class RankingUser(BaseModel):
    posicion: int
    id: int
    nombre: str
    puntuacion_total: int


# ==========================================
# CICLO DE VIDA DE LA APLICACIÓN Y SCHEDULER
# ==========================================
scheduler = BackgroundScheduler()

def tarea_programada_limpieza():
    """Ejemplo de tarea periódica programada utilizando la sesión de base de datos de forma segura."""
    with SessionLocal() as db:
        try:
            # Lógica programada (por ejemplo, mantenimiento o verificación de respuestas)
            pass
        except Exception as e:
            print(f"[Scheduler] Error en tarea programada: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(tarea_programada_limpieza, "cron", hour=3, minute=0)
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(
    title="API Devocionales e Trivia - Módulo Pastor",
    description="Backend ajustado al esquema exacto de models.py",
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
# ENDPOINTS DE AUTENTICACIÓN Y USUARIOS
# ==========================================
@app.post("/registro", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def registrar_usuario(user_data: UserCreate, db: Session = Depends(get_db)):
    nombre_clean = user_data.nombre.strip()

    usuario_existente = db.query(models.User).filter(models.User.nombre == nombre_clean).first()
    if usuario_existente:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya se encuentra registrado.")

    if user_data.telegram_id:
        tg_existente = db.query(models.User).filter(models.User.telegram_id == user_data.telegram_id).first()
        if tg_existente:
            raise HTTPException(status_code=400, detail="El Telegram ID ya está asociado a otra cuenta.")

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

@app.post("/login", response_model=Token)
def iniciar_sesion(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    identifier = form_data.username.strip()

    # Buscar por 'nombre' o por 'telegram_id'
    usuario = db.query(models.User).filter(
        (models.User.nombre == identifier) | (models.User.telegram_id == identifier)
    ).first()

    if not usuario or not verify_password(form_data.password, usuario.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales de acceso incorrectas.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": str(usuario.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/me", response_model=UserResponse)
def obtener_perfil(current_user: models.User = Depends(get_current_user)):
    return current_user


# ==========================================
# ENDPOINTS DE DEVOCIONALES Y PREGUNTAS
# ==========================================
@app.post("/pastor/devocionales", response_model=DevotionalResponse, status_code=status.HTTP_201_CREATED)
def crear_devocional(
    devocional_data: DevotionalCreate,
    db: Session = Depends(get_db),
    pastor: models.User = Depends(require_pastor)
):
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

@app.get("/devocional/ultimo", response_model=DevotionalUserResponse)
def obtener_ultimo_devocional(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    devocional = db.query(models.Devotional).order_by(models.Devotional.fecha.desc()).first()
    if not devocional:
        raise HTTPException(status_code=404, detail="No se encontraron devocionales registrados.")
    return devocional

@app.post("/pastor/preguntas", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def crear_pregunta(
    pregunta_data: QuestionCreate,
    db: Session = Depends(get_db),
    pastor: models.User = Depends(require_pastor)
):
    devocional = db.query(models.Devotional).filter(models.Devotional.id == pregunta_data.devocional_id).first()
    if not devocional:
        raise HTTPException(status_code=404, detail="El devocional especificado no existe.")

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
# ENVÍO DE RESPUESTAS POR EL USUARIO
# ==========================================
@app.post("/respuestas")
def enviar_respuestas(
    envio: BatchAnswerSubmit,
    db: Session = Depends(get_db),
    usuario: models.User = Depends(get_current_user)
):
    resultados = []
    puntos_ganados_autoseleccion = 0

    for item in envio.respuestas:
        pregunta = db.query(models.Question).filter(models.Question.id == item.question_id).first()
        if not pregunta:
            continue

        # Evitar respuestas duplicadas para la misma pregunta por usuario
        existente = db.query(models.UserAnswer).filter(
            models.UserAnswer.user_id == usuario.id,
            models.UserAnswer.question_id == pregunta.id
        ).first()

        if existente:
            resultados.append({
                "question_id": pregunta.id,
                "estado": existente.estado,
                "mensaje": "Ya has respondido a esta pregunta previamente."
            })
            continue

        texto_limpio = item.respuesta_texto.strip() if item.respuesta_texto else ""

        # Evaluación automática si es selección simple o V/F
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
                puntos_ganados_autoseleccion += puntos

            resultados.append({
                "question_id": pregunta.id,
                "estado": estado_resp,
                "puntos_otorgados": puntos
            })

        else:
            # Preguntas de tipo "desarrollo" quedan pendientes de revisión pastoral
            registro = models.UserAnswer(
                user_id=usuario.id,
                question_id=pregunta.id,
                respuesta_texto=texto_limpio,
                estado="pendiente",
                puntos_otorgados=0,
                fecha_envio=datetime.now(timezone.utc)
            )
            resultados.append({
                "question_id": pregunta.id,
                "estado": "pendiente",
                "mensaje": "Respuesta enviada. Pendiente de evaluación pastoral."
            })

        db.add(registro)

    db.commit()
    db.refresh(usuario)

    return {
        "puntuacion_total": usuario.puntuacion_total,
        "puntos_obtenidos_inmediatos": puntos_ganados_autoseleccion,
        "detalles": resultados
    }


# ==========================================
# MÓDULO PASTOR (REVISIÓN Y EVALUACIÓN)
# ==========================================
@app.get("/pastor/revisiones/pendientes", response_model=List[PendingReviewResponse])
def listar_respuestas_pendientes(
    db: Session = Depends(get_db),
    pastor: models.User = Depends(require_pastor)
):
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
def evaluar_respuesta_desarrollo(
    evaluacion: ReviewSubmit,
    db: Session = Depends(get_db),
    pastor: models.User = Depends(require_pastor)
):
    respuesta = db.query(models.UserAnswer).filter(models.UserAnswer.id == evaluacion.respuesta_id).first()
    if not respuesta:
        raise HTTPException(status_code=404, detail="La respuesta seleccionada no existe.")

    if respuesta.estado != "pendiente":
        raise HTTPException(status_code=400, detail="Esta respuesta ya ha sido evaluada previamente.")

    nuevo_estado = "aprobada" if evaluacion.aprobar else "rechazada"
    puntos = evaluacion.puntos_otorgados if evaluacion.aprobar else 0

    respuesta.estado = nuevo_estado
    respuesta.puntos_otorgados = puntos
    respuesta.feedback_pastor = evaluacion.feedback_pastor
    respuesta.fecha_evaluacion = datetime.now(timezone.utc)
    respuesta.evaluado_por = pastor.id

    if evaluacion.aprobar and puntos > 0:
        respuesta.user.puntuacion_total += puntos

    db.commit()
    return {
        "mensaje": "Evaluación guardada correctamente.",
        "estado": nuevo_estado,
        "puntos_otorgados": puntos
    }


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
    if periodo == "diario":
        inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    else:  # semanal
        inicio = ahora - timedelta(days=7)

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