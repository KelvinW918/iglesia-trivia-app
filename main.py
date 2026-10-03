import os
import random
from contextlib import asynccontextmanager
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from apscheduler.schedulers.background import BackgroundScheduler

# Módulos locales del proyecto
import models
from database import engine, get_db, SessionLocal

# Crear tablas en la base de datos
models.Base.metadata.create_all(bind=engine)

# ==========================================
# CONFIGURACIÓN DE SEGURIDAD Y JWT
# ==========================================
SECRET_KEY = os.getenv("SECRET_KEY", "tu_clave_secreta_super_segura_aqui_12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 días de validez

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
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren privilegios de administrador para realizar esta acción."
        )
    return current_user


# ==========================================
# ESQUEMAS PYDANTIC
# ==========================================
class UserCreate(BaseModel):
    username: str
    password: str
    nombre_completo: str
    role: Optional[str] = "usuario"

class UserResponse(BaseModel):
    id: int
    username: str
    nombre_completo: str
    puntos_totales: int
    role: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class QuestionCreate(BaseModel):
    devocional_id: Optional[int] = None
    pregunta: str
    tipo: str  # "seleccion_simple", "v_f", "abierta"
    opcion_a: Optional[str] = None
    opcion_b: Optional[str] = None
    opcion_c: Optional[str] = None
    opcion_d: Optional[str] = None
    respuesta_correcta: str
    explicacion: Optional[str] = None
    puntos: int = 10

class QuestionResponse(QuestionCreate):
    id: int

    class Config:
        from_attributes = True

class QuestionResponseForUser(BaseModel):
    id: int
    devocional_id: Optional[int]
    pregunta: str
    tipo: str
    opcion_a: Optional[str] = None
    opcion_b: Optional[str] = None
    opcion_c: Optional[str] = None
    opcion_d: Optional[str] = None
    puntos: int

    class Config:
        from_attributes = True

class DevotionalCreate(BaseModel):
    titulo: str
    fecha: str  # Formato YYYY-MM-DD
    cita_biblica: str
    contenido: str
    activo: bool = True

class DevotionalResponse(DevotionalCreate):
    id: int
    preguntas: List[QuestionResponse] = []

    class Config:
        from_attributes = True

class DevotionalUserResponse(DevotionalCreate):
    id: int
    preguntas: List[QuestionResponseForUser] = []

    class Config:
        from_attributes = True

class SingleAnswerSubmit(BaseModel):
    question_id: int
    respuesta_texto: str

class BatchAnswerSubmit(BaseModel):
    respuestas: List[SingleAnswerSubmit]

class PendingReviewResponse(BaseModel):
    respuesta_id: int
    usuario_nombre: str
    devocional_titulo: Optional[str]
    pregunta: str
    respuesta_texto: str
    puntos_maximos: int

class ReviewSubmit(BaseModel):
    respuesta_id: int
    es_correcta: bool

class RankingUser(BaseModel):
    posicion: int
    id: int
    nombre_completo: str
    username: str
    puntos: int


# ==========================================
# CICLO DE VIDA DE LA APLICACIÓN Y SCHEDULER
# ==========================================
scheduler = BackgroundScheduler()

def tarea_programada_devocional():
    """Selecciona y activa automáticamente el devocional del día si no hay uno activo."""
    with SessionLocal() as db:
        try:
            hoy_str = date.today().isoformat()
            devocional_hoy = db.query(models.Devotional).filter(models.Devotional.fecha == hoy_str).first()
            if devocional_hoy and not devocional_hoy.activo:
                db.query(models.Devotional).update({models.Devotional.activo: False})
                devocional_hoy.activo = True
                db.commit()
                print(f"[Scheduler] Devocional del día ({hoy_str}) activado automáticamente.")
        except Exception as e:
            print(f"[Scheduler] Error en la tarea de activación de devocionales: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicio: configurar y arrancar el scheduler
    scheduler.add_job(tarea_programada_devocional, "cron", hour=0, minute=1)
    scheduler.start()
    yield
    # Apagado limpio del scheduler
    scheduler.shutdown()

app = FastAPI(
    title="API Trivia Iglesia",
    description="Sistema backend para devocionales diarios, trivia y tabla de posiciones.",
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
    usuario_existente = db.query(models.User).filter(models.User.username == user_data.username).first()
    if usuario_existente:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado.")

    nuevo_usuario = models.User(
        username=user_data.username.strip().lower(),
        password_hash=get_password_hash(user_data.password),
        nombre_completo=user_data.nombre_completo.strip(),
        role=user_data.role if user_data.role in ["usuario", "admin"] else "usuario",
        puntos_totales=0
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    return nuevo_usuario

@app.post("/login", response_model=Token)
def iniciar_sesion(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    username_clean = form_data.username.strip().lower()
    usuario = db.query(models.User).filter(models.User.username == username_clean).first()

    if not usuario or not verify_password(form_data.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": usuario.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/me", response_model=UserResponse)
def obtener_perfil(current_user: models.User = Depends(get_current_user)):
    return current_user


# ==========================================
# ENDPOINTS DE DEVOCIONALES Y PREGUNTAS
# ==========================================
@app.post("/admin/devocionales", response_model=DevotionalResponse, status_code=status.HTTP_201_CREATED)
def crear_devocional(
    devocional_data: DevotionalCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin)
):
    if devocional_data.activo:
        db.query(models.Devotional).update({models.Devotional.activo: False})

    nuevo_devocional = models.Devotional(**devocional_data.model_dump())
    db.add(nuevo_devocional)
    db.commit()
    db.refresh(nuevo_devocional)
    return nuevo_devocional

@app.get("/devocional/hoy", response_model=DevotionalUserResponse)
def obtener_devocional_hoy(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    devocional = db.query(models.Devotional).filter(models.Devotional.activo == True).first()
    if not devocional:
        hoy_str = date.today().isoformat()
        devocional = db.query(models.Devotional).filter(models.Devotional.fecha == hoy_str).first()

    if not devocional:
        raise HTTPException(status_code=404, detail="No hay ningún devocional activo para el día de hoy.")

    return devocional

@app.post("/admin/preguntas", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def crear_pregunta(
    pregunta_data: QuestionCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin)
):
    if pregunta_data.devocional_id:
        devocional = db.query(models.Devotional).filter(models.Devotional.id == pregunta_data.devocional_id).first()
        if not devocional:
            raise HTTPException(status_code=404, detail="El devocional especificado no existe.")

    nueva_pregunta = models.Question(**pregunta_data.model_dump())
    db.add(nueva_pregunta)
    db.commit()
    db.refresh(nueva_pregunta)
    return nueva_pregunta


# ==========================================
# RESPUESTAS Y CORRECCIÓN DE TRIVIA
# ==========================================
@app.post("/respuestas")
def responder_devocional(
    envio: BatchAnswerSubmit,
    db: Session = Depends(get_db),
    usuario: models.User = Depends(get_current_user)
):
    resultados = []
    puntos_ganados_lote = 0

    for item in envio.respuestas:
        pregunta = db.query(models.Question).filter(models.Question.id == item.question_id).first()
        if not pregunta:
            continue

        # Evitar respuestas duplicadas por usuario
        existente = db.query(models.UserAnswer).filter(
            models.UserAnswer.user_id == usuario.id,
            models.UserAnswer.question_id == pregunta.id
        ).first()

        if existente:
            resultados.append({
                "question_id": pregunta.id,
                "estado": "ya_respondida",
                "mensaje": "Esta pregunta ya había sido respondida previamente."
            })
            continue

        texto_limpio = item.respuesta_texto.strip() if item.respuesta_texto else ""

        if pregunta.tipo in ["seleccion_simple", "v_f"]:
            char_respuesta = texto_limpio.upper()[0] if texto_limpio else ""
            char_correcta = pregunta.respuesta_correcta.strip().upper()[0] if pregunta.respuesta_correcta else ""

            es_correcta = (char_respuesta == char_correcta)
            puntos_obtenidos = pregunta.puntos if es_correcta else 0

            registro = models.UserAnswer(
                user_id=usuario.id,
                question_id=pregunta.id,
                respuesta_texto=texto_limpio,
                es_correcta=es_correcta,
                puntos_obtenidos=puntos_obtenidos,
                revisado=True,
                fecha_respuesta=datetime.now(timezone.utc)
            )

            if es_correcta:
                usuario.puntos_totales += puntos_obtenidos
                puntos_ganados_lote += puntos_obtenidos

            resultados.append({
                "question_id": pregunta.id,
                "es_correcta": es_correcta,
                "puntos_obtenidos": puntos_obtenidos,
                "explicacion": pregunta.explicacion
            })

        elif pregunta.tipo == "abierta":
            registro = models.UserAnswer(
                user_id=usuario.id,
                question_id=pregunta.id,
                respuesta_texto=texto_limpio,
                es_correcta=False,
                puntos_obtenidos=0,
                revisado=False,
                fecha_respuesta=datetime.now(timezone.utc)
            )
            resultados.append({
                "question_id": pregunta.id,
                "estado": "pendiente_revision",
                "mensaje": "La respuesta abierta enviada será evaluada por un administrador."
            })

        db.add(registro)

    db.commit()
    db.refresh(usuario)

    return {
        "puntos_totales_usuario": usuario.puntos_totales,
        "puntos_ganados_lote": puntos_ganados_lote,
        "detalles": resultados
    }


# ==========================================
# ENDPOINTS ADMINISTRATIVOS (REVISIÓN)
# ==========================================
@app.get("/admin/revisiones/pendientes", response_model=List[PendingReviewResponse])
def listar_respuestas_pendientes(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin)
):
    pendientes = (
        db.query(models.UserAnswer)
        .join(models.Question)
        .filter(models.UserAnswer.revisado == False)
        .all()
    )

    respuesta = []
    for item in pendientes:
        devocional_titulo = item.question.devocional.titulo if item.question.devocional else "General"
        respuesta.append(PendingReviewResponse(
            respuesta_id=item.id,
            usuario_nombre=item.user.nombre_completo,
            devocional_titulo=devocional_titulo,
            pregunta=item.question.pregunta,
            respuesta_texto=item.respuesta_texto,
            puntos_maximos=item.question.puntos
        ))

    return respuesta

@app.post("/admin/revisiones/evaluar")
def evaluar_respuesta_abierta(
    evaluacion: ReviewSubmit,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin)
):
    respuesta = db.query(models.UserAnswer).filter(models.UserAnswer.id == evaluacion.respuesta_id).first()
    if not respuesta:
        raise HTTPException(status_code=404, detail="La respuesta especificada no existe.")

    if respuesta.revisado:
        raise HTTPException(status_code=400, detail="Esta respuesta ya ha sido evaluada previamente.")

    respuesta.revisado = True
    respuesta.es_correcta = evaluacion.es_correcta

    if evaluacion.es_correcta:
        puntos = respuesta.question.puntos
        respuesta.puntos_obtenidos = puntos
        respuesta.user.puntos_totales += puntos

    db.commit()
    return {"mensaje": "Evaluación procesada con éxito.", "puntos_asignados": respuesta.puntos_obtenidos}


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
            .order_by(models.User.puntos_totales.desc())
            .limit(50)
            .all()
        )
        return [
            RankingUser(
                posicion=idx + 1,
                id=u.id,
                nombre_completo=u.nombre_completo,
                username=u.username,
                puntos=u.puntos_totales
            ) for idx, u in enumerate(usuarios)
        ]

    # Filtrado por rango de fecha para diario/semanal
    ahora = datetime.now(timezone.utc)
    if periodo == "diario":
        inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    else:  # semanal
        inicio = ahora - timedelta(days=7)

    ranking_query = (
        db.query(
            models.User.id,
            models.User.nombre_completo,
            models.User.username,
            func.coalesce(func.sum(models.UserAnswer.puntos_obtenidos), 0).label("puntos_periodo")
        )
        .join(models.UserAnswer, models.User.id == models.UserAnswer.user_id)
        .filter(models.UserAnswer.fecha_respuesta >= inicio)
        .filter(models.UserAnswer.es_correcta == True)
        .group_by(models.User.id)
        .order_by(func.sum(models.UserAnswer.puntos_obtenidos).desc())
        .limit(50)
        .all()
    )

    return [
        RankingUser(
            posicion=idx + 1,
            id=row.id,
            nombre_completo=row.nombre_completo,
            username=row.username,
            puntos=row.puntos_periodo
        ) for idx, row in enumerate(ranking_query)
    ]