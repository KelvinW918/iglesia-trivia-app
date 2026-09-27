from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    telegram_id = Column(String, unique=True, nullable=True)
    rol = Column(String, default="miembro")  # "miembro" o "pastor"
    puntuacion_total = Column(Integer, default=0)
    password = Column(String, nullable=False, default="0000")

    answers = relationship(
        "UserAnswer",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="UserAnswer.user_id"
    )

class Devotional(Base):
    __tablename__ = "devotionals"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String, nullable=False)
    fecha = Column(DateTime, default=datetime.datetime.utcnow)
    resumen_ia = Column(Text, nullable=True)

    questions = relationship("Question", back_populates="devotional", cascade="all, delete-orphan")

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    devocional_id = Column(Integer, ForeignKey("devotionals.id"), nullable=False)
    enunciado = Column(Text, nullable=False)
    tipo = Column(String, default="desarrollo")
    opciones = Column(Text, nullable=True)
    respuesta_correcta = Column(String, nullable=True)

    devotional = relationship("Devotional", back_populates="questions")
    answers = relationship("UserAnswer", back_populates="question", cascade="all, delete-orphan")

class UserAnswer(Base):
    __tablename__ = "user_answers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    respuesta_texto = Column(Text, nullable=False)
    estado = Column(String, default="pendiente")   # "pendiente", "aprobada", "rechazada"
    puntos_otorgados = Column(Integer, default=0)

    # --- Nuevos campos para el módulo Pastor ---
    fecha_envio = Column(DateTime, default=datetime.datetime.utcnow)
    feedback_pastor = Column(Text, nullable=True)
    fecha_evaluacion = Column(DateTime, nullable=True)
    evaluado_por = Column(Integer, ForeignKey("users.id"), nullable=True)

    user = relationship("User", back_populates="answers", foreign_keys=[user_id])
    evaluador = relationship("User", foreign_keys=[evaluado_por])
    question = relationship("Question", back_populates="answers")