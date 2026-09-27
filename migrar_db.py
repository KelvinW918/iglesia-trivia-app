# migrar_db.py
# Ejecutar UNA SOLA VEZ (o varias, es idempotente) antes de reiniciar el backend
# con el models.py actualizado. Añade las columnas nuevas a user_answers
# sin perder datos existentes.

import sqlite3
import os
import sys

DB_PATH = "trivia_iglesia.db"


def add_column_if_missing(cur, table, column, ddl):
    cur.execute(f"PRAGMA table_info({table})")
    cols = [row[1] for row in cur.fetchall()]
    if column not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
        print(f"✅ Añadida columna: {table}.{column}")
        return True
    else:
        print(f"ℹ️  Ya existe: {table}.{column}")
        return False


def main():
    if not os.path.exists(DB_PATH):
        print(f"⚠️  No se encontró '{DB_PATH}'.")
        print("   No hay nada que migrar: la BD se creará al arrancar el backend.")
        sys.exit(0)

    print(f"🔧 Migrando base de datos: {DB_PATH}\n")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    try:
        # --- 1. Añadir columnas nuevas a user_answers ---
        print("📦 Paso 1: Añadiendo columnas nuevas a 'user_answers'...")
        add_column_if_missing(cur, "user_answers", "fecha_envio", "DATETIME")
        add_column_if_missing(cur, "user_answers", "feedback_pastor", "TEXT")
        add_column_if_missing(cur, "user_answers", "fecha_evaluacion", "DATETIME")
        add_column_if_missing(cur, "user_answers", "evaluado_por", "INTEGER")

        # --- 2. Rellenar fecha_envio para filas existentes ---
        print("\n📅 Paso 2: Rellenando 'fecha_envio' con la fecha del devocional asociado...")
        cur.execute("""
            UPDATE user_answers
            SET fecha_envio = (
                SELECT d.fecha
                FROM devotionals d
                JOIN questions q ON q.devocional_id = d.id
                WHERE q.id = user_answers.question_id
            )
            WHERE fecha_envio IS NULL
        """)
        filas_fecha = cur.rowcount
        print(f"   → {filas_fecha} fila(s) actualizada(s)")

        # --- 3. Rellenar fecha_evaluacion para las ya evaluadas ---
        print("\n📅 Paso 3: Rellenando 'fecha_evaluacion' para respuestas ya dictaminadas...")
        cur.execute("""
            UPDATE user_answers
            SET fecha_evaluacion = COALESCE(fecha_envio, CURRENT_TIMESTAMP)
            WHERE estado IN ('aprobada', 'rechazada')
              AND fecha_evaluacion IS NULL
        """)
        filas_eval = cur.rowcount
        print(f"   → {filas_eval} fila(s) actualizada(s)")

        # --- 4. Verificación final ---
        print("\n🔍 Paso 4: Verificación de columnas en 'user_answers'...")
        cur.execute("PRAGMA table_info(user_answers)")
        columnas_finales = [row[1] for row in cur.fetchall()]
        requeridas = ["fecha_envio", "feedback_pastor", "fecha_evaluacion", "evaluado_por"]
        for col in requeridas:
            estado = "✅" if col in columnas_finales else "❌"
            print(f"   {estado} {col}")

        conn.commit()
        print("\n🎉 Migración completada correctamente.")
        print("   Reinicia el backend (uvicorn) para aplicar los cambios.")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Error durante la migración: {e}")
        print("   Se hizo rollback. La BD quedó intacta.")
        sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()