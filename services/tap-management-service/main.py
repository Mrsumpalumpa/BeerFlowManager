import os
import logging
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from models.database import engine, Base, async_session, Tap, Keg
from routers import admin_kegs, admin_ws

logger = logging.getLogger("tap_management.seed")


async def _seed_taps():
    """Crea los grifos y barriles iniciales si no existen."""
    default_taps = [
        {"id": "tap-001", "name": "Grifo 1", "price_per_ml": 0.0065},
        {"id": "tap-002", "name": "Grifo 2", "price_per_ml": 0.0045},
    ]

    async with async_session() as session:
        for tap_data in default_taps:
            result = await session.execute(select(Tap).where(Tap.tap_code == tap_data["id"]))
            if result.scalar_one_or_none():
                logger.info(f"[seed] Grifo '{tap_data['id']}' ya existe. Omitiendo.")
                continue

            # Crear barril inicial (25L)
            keg = Keg(
                name=f"Barril {tap_data['name']}",
                beer_style=None,
                capacity_ml=25000,
                remaining_ml=25000
            )
            session.add(keg)
            await session.flush() # para obtener el ID generado del barril

            # Crear grifo
            tap = Tap(
                tap_code=tap_data["id"],
                name=tap_data["name"],
                keg_id=keg.id,
                price_per_ml=tap_data["price_per_ml"]
            )
            session.add(tap)
            logger.info(f"[seed] ✅ Grifo '{tap_data['id']}' y barril de 25L creados.")

        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Crear tablas
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # 2. Seed de grifos y barriles iniciales
    await _seed_taps()
    yield


app = FastAPI(title="Tap Management Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# IMPORTANTE: las rutas estáticas van ANTES que las dinámicas con {tap_id}
# para evitar que FastAPI interprete "stock" como un parámetro de ruta.
app.include_router(admin_kegs.router, prefix="/admin", tags=["admin"])
app.include_router(admin_ws.router, tags=["admin_ws"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "tap-management-service"}


@app.get("/taps")
async def get_all_taps():
    """Devuelve la lista de todos los grifos activos con información de stock."""
    async with async_session() as session:
        result = await session.execute(
            select(Tap).where(Tap.is_active == True).options(joinedload(Tap.keg))
        )
        taps = result.scalars().all()
        
        output = []
        for tap in taps:
            keg = tap.keg
            is_blocked = True
            percentage = 0.0
            
            if keg:
                current_vol = float(keg.remaining_ml)
                capacity = float(keg.capacity_ml) if keg.capacity_ml > 0 else 25000.0
                percentage = (current_vol / capacity) * 100.0
                is_blocked = percentage <= 5.0
                
            output.append({
                "tap_code": tap.tap_code,
                "name": tap.name or tap.tap_code,
                "price_per_ml": float(tap.price_per_ml),
                "is_blocked": is_blocked,
                "percentage_left": percentage
            })
        return output


@app.get("/taps/{tap_id}/price")
async def get_tap_price(tap_id: str):
    """Devuelve el precio por ml del grifo (leído de PostgreSQL)."""
    async with async_session() as session:
        result = await session.execute(select(Tap).where(Tap.tap_code == tap_id))
        tap = result.scalar_one_or_none()
        if tap:
            return {"tap_id": tap_id, "price_per_ml": float(tap.price_per_ml)}
    # Fallback si el grifo no existe en BD
    fallback_prices = {"tap-001": 0.0065, "tap-002": 0.0045}
    return {"tap_id": tap_id, "price_per_ml": fallback_prices.get(tap_id, 0.005)}


@app.get("/taps/{tap_id}/active-keg")
async def get_active_keg(tap_id: str):
    """Devuelve la información del barril activo para un grifo."""
    async with async_session() as session:
        result = await session.execute(
            select(Tap).where(Tap.tap_code == tap_id).options(joinedload(Tap.keg))
        )
        tap = result.scalar_one_or_none()
        if tap:
            keg = tap.keg
            return {
                "tap_id": tap_id,
                "price_per_ml": float(tap.price_per_ml),
                "keg_id": str(keg.id) if keg else None,
                "beer_style": keg.beer_style if keg else None,
                "capacity_ml": keg.capacity_ml if keg else 25000,
                "remaining_ml": keg.remaining_ml if keg else 0,
            }
    raise HTTPException(status_code=404, detail="Tap not found")


@app.post("/kegs/{keg_id}/consume")
async def consume_keg(keg_id: uuid.UUID, ml_consumed: float):
    """Descuenta volumen consumido de un barril en la base de datos."""
    async with async_session() as session:
        result = await session.execute(select(Keg).where(Keg.id == keg_id))
        keg = result.scalar_one_or_none()
        if not keg:
            raise HTTPException(status_code=404, detail="Keg not found")
        keg.remaining_ml = max(0, int(keg.remaining_ml - ml_consumed))
        session.add(keg)
        await session.commit()
        return {"keg_id": str(keg.id), "remaining_ml": keg.remaining_ml}



