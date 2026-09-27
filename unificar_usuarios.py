import sqlite3

db_path = r"c:\Users\Usuario\iglesia-trivia-app\trivia_iglesia.db"

try:
    conexion = sqlite3.connect(db_path)
    cursor = conexion.cursor()

    # 1. Verificamos las columnas actuales de la tabla 'users'
    cursor.execute("PRAGMA table_info(users);")
    columnas = [info[1] for info in cursor.fetchall()]

    # Si no tienen las columnas rol o password, las añadimos
    if 'rol' not in columnas:
        cursor.execute("ALTER TABLE users ADD COLUMN rol TEXT DEFAULT 'miembro';")
        print("Migración: Se añadió la columna 'rol'.")

    if 'password' not in columnas:
        cursor.execute("ALTER TABLE users ADD COLUMN password TEXT DEFAULT '1234';")
        print("Migración: Se añadió la columna 'password'.")

    # 2. Aseguramos que los usuarios existentes tengan el rol de miembro por defecto
    cursor.execute("UPDATE users SET rol = 'miembro' WHERE rol IS NULL OR rol = '';")

    # 3. Configuramos a los pastores oficiales: Kelvin Williams y Nerkely Williams
    pastores = [
        ('Kelvin Williams', 'pastor2026'),
        ('Nerlyn Williams', 'pastor2026')
    ]

    for nombre_pastor, pass_pastor in pastores:
        # Verificamos si ya existen en la tabla users
        cursor.execute("SELECT id FROM users WHERE nombre = ?;", (nombre_pastor,))
        existente = cursor.fetchone()

        if existente:
            # Si ya existen (como Juan Pérez o en otra forma), actualizamos su rol y contraseña
            cursor.execute("UPDATE users SET rol = 'pastor', password = ? WHERE nombre = ?;", (pass_pastor, nombre_pastor))
            print(f"Actualizado a rol pastor: {nombre_pastor}")
        else:
            # Si no estaban, los insertamos directamente
            cursor.execute("INSERT INTO users (nombre, rol, password) VALUES (?, 'pastor', ?);", (nombre_pastor, pass_pastor))
            print(f"Insertado nuevo pastor: {nombre_pastor}")

    # 4. Eliminamos la tabla duplicada y sobrante 'usuarios'
    cursor.execute("DROP TABLE IF EXISTS usuarios;")
    print("Se eliminó la tabla redundante 'usuarios'.")

    conexion.commit()
    conexion.close()
    print("¡Listo! La base de datos ha sido unificada y optimizada con éxito.")

except Exception as e:
    print("Ocurrió un error durante la migración:", e)