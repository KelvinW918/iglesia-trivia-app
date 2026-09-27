# fix_pines_pastores.py
import sqlite3

conn = sqlite3.connect('trivia_iglesia.db')
cur = conn.cursor()

print("=== ANTES ===")
cur.execute("SELECT id, nombre, rol, password FROM users ORDER BY id")
for r in cur.fetchall():
    print(" ", r)

# Actualizar SOLO los pastores que tengan contraseñas no numéricas o >4 chars
cur.execute("""
    UPDATE users
    SET password = CASE id
        WHEN 3 THEN '3456'
        WHEN 6 THEN '6789'
        ELSE password
    END
    WHERE rol = 'pastor'
      AND (LENGTH(password) != 4 OR password NOT GLOB '[0-9][0-9][0-9][0-9]')
""")
print(f"\n🔧 Pastores actualizados: {cur.rowcount}")

conn.commit()

print("\n=== DESPUÉS ===")
cur.execute("SELECT id, nombre, rol, password FROM users ORDER BY id")
for r in cur.fetchall():
    print(" ", r)

conn.close()
print("\n🎉 Listo. Reinicia el backend si estaba corriendo.")