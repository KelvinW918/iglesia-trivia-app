# migrar_pin_a_hash.py  (v2 — usa bcrypt directamente, sin passlib)
import os
import sys
import random
from sqlalchemy import create_engine, text
import bcrypt

# ─── Config ───
url = os.getenv("DATABASE_URL")
if not url:
    sys.exit("❌ Define DATABASE_URL antes de ejecutar.")

if url.startswith("postgres://"):
    url = url.replace("postgres://", "postgresql+psycopg2://", 1)
elif url.startswith("postgresql://") and "+psycopg2" not in url:
    url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

if "render.com" in url and "sslmode" not in url:
    url += "?sslmode=require" if "?" not in url else "&sslmode=require"

engine = create_engine(url, pool_pre_ping=True)


def hash_pin(pin: str) -> str:
    """Genera hash bcrypt directamente (sin passlib)."""
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def es_hash_bcrypt(valor) -> bool:
    """Detecta si un string ya es un hash bcrypt ($2a$, $2b$, $2y$)."""
    return isinstance(valor, str) and valor.startswith(("$2a$", "$2b$", "$2y$"))


# ─── Migración ───
with engine.begin() as conn:
    print("🔍 Inspeccionando columnas de 'users'...")

    cols = conn.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users'
    """)).fetchall()
    nombres = {c[0] for c in cols}

    password_existe = "password" in nombres
    pin_hash_existe = "pin_hash" in nombres

    print(f"   password existe: {password_existe}")
    print(f"   pin_hash existe: {pin_hash_existe}")

    if not password_existe and not pin_hash_existe:
        sys.exit("❌ Ninguna columna existe. La tabla 'users' está mal.")

    if password_existe and pin_hash_existe:
        sys.exit("❌ Ambas columnas existen. Revisa manualmente.")

    # ─── 1. Renombrar si hace falta ───
    if password_existe:
        print("\n🔧 Renombrando 'password' → 'pin_hash'...")
        conn.execute(text("ALTER TABLE users RENAME COLUMN password TO pin_hash"))
        print("   ✅ Columna renombrada.")
    else:
        print("\n✅ La columna ya se llama 'pin_hash'.")

    # ─── 2. Leer usuarios ───
    rows = conn.execute(text(
        "SELECT id, nombre, rol, pin_hash FROM users ORDER BY id"
    )).fetchall()
    print(f"\n👥 Usuarios encontrados: {len(rows)}")

    # ─── 3. Hashear los que estén en texto plano ───
    actualizados = 0
    for row in rows:
        uid, nombre, rol, valor = row
        if valor is None:
            print(f"   ⚠️ Usuario {uid} ({nombre}) tiene pin_hash NULL — se omite")
            continue
        if es_hash_bcrypt(valor):
            print(f"   ✓ Usuario {uid} ({nombre}, {rol}) ya hasheado")
            continue
        nuevo_hash = hash_pin(valor)
        conn.execute(
            text("UPDATE users SET pin_hash = :h WHERE id = :id"),
            {"h": nuevo_hash, "id": uid}
        )
        print(f"   🔐 Usuario {uid} ({nombre}, {rol}) hasheado")
        actualizados += 1

    print(f"\n✅ {actualizados} usuario(s) hasheado(s)")

    # ─── 4. Reset del PIN del pastor ───
    pastor_row = conn.execute(text(
        "SELECT id, nombre FROM users WHERE rol = 'pastor' ORDER BY id LIMIT 1"
    )).first()

    if pastor_row:
        pastor_id, pastor_nombre = pastor_row
        nuevo_pin = str(random.randint(1000, 9999))
        conn.execute(
            text("UPDATE users SET pin_hash = :h WHERE id = :id"),
            {"h": hash_pin(nuevo_pin), "id": pastor_id}
        )
        print("\n" + "=" * 64)
        print("🔑 PIN RESETEADO PARA EL PASTOR")
        print(f"   Nombre:    {pastor_nombre}  (id={pastor_id})")
        print(f"   PIN NUEVO: {nuevo_pin}")
        print("   ⚠️  ANÓTALO — NO SE VOLVERÁ A MOSTRAR EN CLARO")
        print("=" * 64)
    else:
        print("\n⚠️ No se encontró pastor.")

    # ─── 5. Verificación ───
    verif = conn.execute(text(
        "SELECT id, nombre, rol, LEFT(pin_hash, 7) FROM users ORDER BY id"
    )).fetchall()

    print("\n📋 Estado final:")
    for uid, nombre, rol, prefijo in verif:
        print(f"   id={uid}  {rol:7s}  {nombre:30s}  hash={prefijo}...")

print("\n🎉 Migración completa.")
print("   Siguiente paso: git push (services.py, models.py, main.py)")