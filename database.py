# database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


def _normalize_db_url(url: str) -> str:
    """Render entrega postgres:// o postgresql://; SQLAlchemy exige dialecto+driver."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg2://", 1)
    if url.startswith("postgresql://") and "+psycopg2" not in url:
        return url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


SQLALCHEMY_DATABASE_URL = _normalize_db_url(
    os.getenv("DATABASE_URL", "sqlite:///./trivia_iglesia.db")
)

is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

# ─── Engine: tuning crítico para Render free tier ───
# pool_pre_ping → detecta conexiones muertas antes de usarlas
# pool_recycle  → recicla conexiones antes de que Render las cierre (~5 min idle)
engine_kwargs = {
    "pool_pre_ping": True,
    "pool_recycle": 280,
}

if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["connect_args"] = {"connect_timeout": 10}
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency de FastAPI: cede una sesión y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()