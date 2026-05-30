#!/usr/bin/env python3
"""
scripts/create_admin.py
───────────────────────
Crea el usuario administrador inicial en la base de datos del billing-service.

Lee INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD del entorno (o .env).

Uso:
  # Con el stack de Docker corriendo:
  docker compose exec billing-service python /app/scripts/create_admin.py

  # O directamente desde el host (con .env en el directorio raíz):
  cd services/billing-service
  python ../../scripts/create_admin.py
"""
import asyncio
import os
import sys
from pathlib import Path

# Permitir cargar .env manualmente si no están en el entorno
env_file = Path(__file__).resolve().parents[1] / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

# Ajustar el path para importar los modelos del billing-service
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "billing-service"))

from sqlalchemy import select
from passlib.context import CryptContext

from models.database import async_session, Base, engine, User, RoleEnum

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def create_admin():
    username = os.getenv("INITIAL_ADMIN_USERNAME", "admin")
    password = os.getenv("INITIAL_ADMIN_PASSWORD")

    if not password:
        print("❌ Error: INITIAL_ADMIN_PASSWORD no está definida en el entorno o en el .env.")
        sys.exit(1)

    # Crear tablas si no existen
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # Comprobar si ya existe
        result = await session.execute(select(User).where(User.username == username))
        existing = result.scalar_one_or_none()

        if existing:
            print(f"⚠️  El usuario '{username}' ya existe (rol: {existing.role.value}). No se realizaron cambios.")
            return

        admin = User(
            username=username,
            password_hash=pwd_context.hash(password),
            role=RoleEnum.ADMIN,
        )
        session.add(admin)
        await session.commit()
        print(f"✅ Usuario administrador '{username}' creado correctamente.")


if __name__ == "__main__":
    asyncio.run(create_admin())
