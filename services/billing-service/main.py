import os
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException

from models.database import engine, Base, async_session, User, RoleEnum, Consumption, get_db
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


class CloseOrderPayload(BaseModel):
    tap_id: str
    customer_id: Optional[int | str] = None
    keg_id: Optional[str] = "no-keg"
    beer_style: Optional[str] = "Cerveza"
    ml_served: float
    total_amount: float

@app.post("/orders/close")
async def close_order(payload: CloseOrderPayload, db: AsyncSession = Depends(get_db)):
    logger.info(f"[billing] Cerrando orden: {payload}")
    
    if payload.customer_id and payload.ml_served > 0:
        try:
            # Support both integer IDs and usernames for simulator convenience
            cust_id_raw = str(payload.customer_id)
            if cust_id_raw.isdigit():
                cust_id = int(cust_id_raw)
            else:
                # Look up user by username
                res = await db.execute(select(User).where(User.username == cust_id_raw))
                user = res.scalar_one_or_none()
                if not user:
                    logger.error(f"[billing] Usuario no encontrado para métricas: {cust_id_raw}")
                    return {"ok": False, "error": "Usuario no encontrado"}
                cust_id = user.id
            
            consumption = Consumption(
                customer_id=cust_id,
                tap_id=payload.tap_id,
                keg_id=payload.keg_id,
                beer_style=payload.beer_style,
                ml_served=payload.ml_served,
                total_amount=payload.total_amount
            )
            db.add(consumption)
            await db.commit()
            logger.info(f"[billing] ✅ Consumo registrado: {payload.ml_served}ml para cliente {cust_id}")
        except Exception as e:
            logger.error(f"[billing] Error registrando consumo: {e}")
            await db.rollback()
            
    return {"ok": True, "order_id": None}


@app.get("/metrics")
async def get_metrics(db: AsyncSession = Depends(get_db)):
    # 1. Top Customers
    top_customers_query = (
        select(
            User.username,
            func.sum(Consumption.ml_served).label("total_ml"),
            func.sum(Consumption.total_amount).label("total_eur")
        )
        .join(User, User.id == Consumption.customer_id)
        .group_by(User.id, User.username)
        .order_by(desc("total_eur"))
        .limit(10)
    )
    res_cust = await db.execute(top_customers_query)
    top_customers = [
        {"username": row.username, "total_ml": round(row.total_ml or 0, 2), "total_eur": round(row.total_eur or 0, 2)}
        for row in res_cust
    ]

    # 2. Popularity by Beer Style
    beer_styles_query = (
        select(
            Consumption.beer_style,
            func.sum(Consumption.ml_served).label("total_ml"),
            func.sum(Consumption.total_amount).label("total_eur")
        )
        .group_by(Consumption.beer_style)
        .order_by(desc("total_ml"))
    )
    res_styles = await db.execute(beer_styles_query)
    beer_styles = [
        {"beer_style": row.beer_style, "total_ml": round(row.total_ml or 0, 2), "total_eur": round(row.total_eur or 0, 2)}
        for row in res_styles
    ]

    # 3. Recent Consumptions
    recent_query = (
        select(
            User.username,
            Consumption.tap_id,
            Consumption.beer_style,
            Consumption.ml_served,
            Consumption.total_amount,
            Consumption.created_at
        )
        .join(User, User.id == Consumption.customer_id)
        .order_by(desc(Consumption.created_at))
        .limit(15)
    )
    res_recent = await db.execute(recent_query)
    recent_consumptions = [
        {
            "username": row.username,
            "tap_id": row.tap_id,
            "beer_style": row.beer_style,
            "ml_served": round(row.ml_served, 2),
            "total_amount": round(row.total_amount, 2),
            "date": row.created_at.isoformat()
        }
        for row in res_recent
    ]

    return {
        "top_customers": top_customers,
        "beer_styles": beer_styles,
        "recent": recent_consumptions
    }

