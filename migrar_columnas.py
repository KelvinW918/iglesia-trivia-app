# migrar_columnas.py
import os
from sqlalchemy import create_engine, text

# Usa la External Database URL de Render (la que empieza con postgresql://)
url = os.getenv("DATABASE_URL")
if url.startswith("postgres://"):
    url = url.replace("postgres://", "postgresql+psycopg2://", 1)
elif url.startswith("postgresql://"):
    url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

engine = create_engine(url)

ALTERS = [
    "ALTER TABLE devotionals ADD COLUMN IF NOT EXISTS youtube_id VARCHAR;",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_devotionals_youtube_id ON devotionals (youtube_id);",
    "ALTER TABLE user_answers ADD COLUMN IF NOT EXISTS fecha_envio TIMESTAMP DEFAULT NOW();",
    "ALTER TABLE user_answers ADD COLUMN IF NOT EXISTS feedback_pastor TEXT;",
    "ALTER TABLE user_answers ADD COLUMN IF NOT EXISTS fecha_evaluacion TIMESTAMP;",
    "ALTER TABLE user_answers ADD COLUMN IF NOT EXISTS evaluado_por INTEGER REFERENCES users(id);",
]

with engine.begin() as conn:
    for stmt in aplazamientos if False else ALTERS:
        conn.execute(text(stmt))
        print(f"✅ {stmt[:70]}...")

print("\n🎉 Migración completa")