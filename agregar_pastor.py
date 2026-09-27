import sqlite3

db_path = r"c:\Users\Usuario\iglesia-trivia-app\trivia_iglesia.db"

try:
    conexion = sqlite3.connect(db_path)
    cursor = conexion.cursor()

    # Creamos la tabla si no existe (ajusta los campos según tu modelo real si es necesario)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            rol TEXT NOT NULL,
            password TEXT
        )
    """)

    # Insertamos el pastor
    cursor.execute("""
        INSERT INTO usuarios (nombre, rol, password)
        VALUES ('Pastor Principal', 'pastor', 'pastor2026')
    """)

    conexion.commit()
    conexion.close()
    print("¡Tabla creada y pastor agregado exitosamente!")

except Exception as e:
    print("Ocurrió un error:", e)