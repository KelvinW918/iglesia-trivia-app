# borrar_devocional_huerfano.py
import os
from sqlalchemy import create_engine, text

url = os.getenv("DATABASE_URL")
if not url:
    raise SystemExit("❌ Define DATABASE_URL antes de ejecutar.")

if url.startswith("postgres://"):
    url = url.replace("postgres://", "postgresql+psycopg2://", 1)
elif url.startswith("postgresql://"):
    url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

# Añadir SSL si es de Render
if "render.com" in url and "sslmode" not in url:
    url += "?sslmode=require" if "?" not in url else "&sslmode=require"

engine = create_engine(url)

with engine.begin() as conn:
    # Cuántas preguntas tiene el devocional #1
    result = conn.execute(text(
        "SELECT COUNT(*) FROM questions WHERE devocional_id = 1"
    )).scalar()
    print(f"Preguntas asociadas al devocional #1: {result}")

    # Borrar preguntas del devocional #1 (por si acaso)
    conn.execute(text("DELETE FROM user_answers WHERE question_id IN (SELECT id FROM questions WHERE devocional_id = 1)"))
    conn.execute(text("DELETE FROM questions WHERE devocional_id = 1"))
    print("✅ Preguntas (y respuestas asociadas) del devocional #1 borradas")

    # Borrar el devocional #1
    conn.execute(text("DELETE FROM devotionals WHERE id = 1"))
    print("✅ Devocional #1 borrado")

    # Confirmar
    result = conn.execute(text("SELECT COUNT(*) FROM devotionals")).scalar()
    print(f"\n📊 Devocionales restantes en BD: {result}")

print("\n🎉 Listo. Ahora puedes llamar /devocionales/generar-diario de nuevo.")