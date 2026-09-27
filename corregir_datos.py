# corregir_datos.py
import sqlite3

conn = sqlite3.connect('trivia_iglesia.db')
cur = conn.cursor()

print("=== ANTES ===")
cur.execute("SELECT id, nombre, rol, puntuacion_total FROM users ORDER BY id")
for r in cur.fetchall():
    print(" ", r)

# 1. Revertir puntos del pastor Kelvin (id=3) y borrar sus respuestas
print("\n🔧 Corrigiendo pastor Kelvin (id=3)...")
cur.execute("SELECT SUM(puntos_otorgados) FROM user_answers WHERE user_id=3")
puntos_kelvin = cur.fetchone()[0] or 0
print(f"   Puntos a revertir: {puntos_kelvin}")

cur.execute("UPDATE users SET puntuacion_total = 0 WHERE id=3")
cur.execute("DELETE FROM user_answers WHERE user_id=3")
print(f"   Respuestas borradas: {cur.rowcount}")

# 2. Arreglar puntuacion_total NULL (Nerlyn Williams id=6)
print("\n🔧 Corrigiendo puntuacion_total NULL...")
cur.execute("UPDATE users SET puntuacion_total = 0 WHERE puntuacion_total IS NULL")
print(f"   Filas corregidas: {cur.rowcount}")

conn.commit()

print("\n=== DESPUÉS ===")
cur.execute("SELECT id, nombre, rol, puntuacion_total FROM users ORDER BY id")
for r in cur.fetchall():
    print(" ", r)

cur.execute("SELECT COUNT(*) FROM user_answers")
print(f"\nRespuestas restantes: {cur.fetchone()[0]}")

conn.close()
print("\n🎉 Corrección completada.")