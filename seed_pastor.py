import sys
import os
from passlib.context import CryptContext

# Importar el motor de base de datos y los modelos de tu proyecto
from database import SessionLocal
import models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def crear_pastor_inicial():
    db = SessionLocal()
    try:
        nombre_pastor = "Pastor Principal"
        password_plana = "pastor2026"

        # Verificar si el pastor ya existe para no duplicarlo
        existente = db.query(models.User).filter(
            (models.User.nombre == nombre_pastor) | (models.User.rol == "pastor")
        ).first()

        if existente:
            print(f"El usuario pastor ya existe: {existente.nombre} (ID: {existente.id})")
            return

        # Generar hash seguro de la contraseña
        hashed_password = pwd_context.hash(password_plana)

        # Crear instancia de usuario pastor según models.py
        nuevo_pastor = models.User(
            nombre=nombre_pastor,
            password=hashed_password,
            rol="pastor",
            puntuacion_total=0
        )

        db.add(nuevo_pastor)
        db.commit()
        db.refresh(nuevo_pastor)

        print("==========================================")
        print("¡Pastor registrado con éxito en producción!")
        print(f"ID: {nuevo_pastor.id}")
        print(f"Nombre: {nuevo_pastor.nombre}")
        print(f"Rol: {nuevo_pastor.rol}")
        print("==========================================")

    except Exception as e:
        db.rollback()
        print(f"Error al intentar crear el pastor: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    crear_pastor_inicial()