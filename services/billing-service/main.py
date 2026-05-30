import os
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import select
from passlib.context import CryptContext

from models.database import engine, Base, async_session, User, RoleEnum
from routers import auth

logger = logging.getLogger("billing.seed")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def _seed_admin():
    """Crea el usuario ADMIN inicial si no existe."""
    username = os.getenv("INITIAL_ADMIN_USERNAME", "admin")
    password = os.getenv("INITIAL_ADMIN_PASSWORD")

    if not password:
        logger.warning(
            "INITIAL_ADMIN_PASSWORD no está definida. "
            "No se creará el usuario administrador inicial."
        )
        return

    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == username))
        if result.scalar_one_or_none():
            logger.info(f"[seed] Usuario admin '{username}' ya existe. Omitiendo.")
            return

        admin = User(
            username=username,
            password_hash=pwd_context.hash(password),
            role=RoleEnum.ADMIN,
        )
        session.add(admin)
        await session.commit()
        logger.info(f"[seed] ✅ Usuario admin '{username}' creado correctamente.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Crear tablas
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # 2. Seed del admin inicial
    await _seed_admin()
    yield


app = FastAPI(title="Billing Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "billing-service"}


@app.post("/orders/close")
async def close_order(payload: dict):
    # TODO: Fase 4 — descontar saldo y generar recibo
    logger.info(f"[billing] Cerrando orden: {payload}")
    return {"ok": True, "order_id": None}

