# verificar_puntos.py
import sqlite3
conn = sqlite3.connect('trivia_iglesia.db')
cur = conn.cursor()

print("=== Estado de usuarios ===")
cur.execute("SELECT id, nombre, rol, puntuacion_total FROM users ORDER BY id")
for r in cur.fetchall():
    print(" ", r)

print("\n=== Respuestas evaluadas por pastor ===")
cur.execute("""
    SELECT ua.id, ua.user_id, u.nombre, ua.estado, ua.puntos_otorgados, ua.feedback_pastor, ua.fecha_evaluacion
    FROM user_answers ua
    JOIN users u ON u.id = ua.user_id
    WHERE ua.estado IN ('aprobada', 'rechazada')
    ORDER BY ua.id
""")
for r in cur.fetchall():
    print(" ", r)

print("\n=== Suma real de puntos por usuario ===")
cur.execute("""
    SELECT u.id, u.nombre, u.puntuacion_total as puntos_registrados, COALESCE(SUM(ua.puntos_otorgados), 0) as puntos_reales
    FROM users u
    LEFT JOIN user_answers ua ON ua.user_id = u.id
    WHERE u.rol = 'miembro'
    GROUP BY u.id
    ORDER BY u.id
""")
print(f"  {'ID':<4} {'Nombre':<20} {'Registrado':<12} {'Real (suma)':<12} {'¿Cuadra?'}")
for r in cur.fetchall():
    cuadra = "✅" if r[2] == r[3] else "❌"
    print(f"  {r[0]:<4} {r[1]:<20} {r[2]:<12} {r[3]:<12} {cuadra}")

conn.close()