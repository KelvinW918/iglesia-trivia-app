# verificar.py
import sqlite3

conn = sqlite3.connect('trivia_iglesia.db')
cur = conn.cursor()

print("=== Todos los Kelvin / Williams ===")
cur.execute("""
    SELECT id, nombre, rol, puntuacion_total
    FROM users
    WHERE nombre LIKE '%Kelvin%' OR nombre LIKE '%Williams%'
    ORDER BY id
""")
for r in cur.fetchall():
    print(" ", r)

print()
cur.execute("SELECT COUNT(*) FROM users")
print("Total usuarios:", cur.fetchone()[0])

cur.execute("SELECT MAX(id) FROM users")
print("Último id:", cur.fetchone()[0])

print()
print("=== Todas las respuestas ===")
cur.execute("""
    SELECT ua.id, ua.user_id, u.nombre, u.rol, ua.question_id, ua.estado, ua.puntos_otorgados
    FROM user_answers ua
    LEFT JOIN users u ON u.id = ua.user_id
    ORDER BY ua.id
""")
for r in cur.fetchall():
    print(" ", r)

conn.close()