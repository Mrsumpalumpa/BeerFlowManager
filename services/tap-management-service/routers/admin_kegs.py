import os
import jwt
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload

from models.database import get_db, Keg, Tap
from models.schemas import (
    KegResponse, StockStatusResponse, KegCreate,
    TapCreate, TapUpdate, TapResponse
)
import redis.asyncio as aioredis

router = APIRouter()

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")

async def invalidate_tap_cache(tap_id: str):
    """Elimina las claves de caché del grifo en Redis."""
    try:
        r = await aioredis.from_url(REDIS_URL, decode_responses=True)
        keys = [
            f"keg:id:{tap_id}",
            f"keg:remaining:{tap_id}",
            f"keg:capacity:{tap_id}",
            f"keg:style:{tap_id}",
            f"tap_price:{tap_id}",
            f"tap:{tap_id}"
        ]
        await r.delete(*keys)
        await r.aclose()
        print(f"[tap-management] Caché invalidado en Redis para {tap_id}")
    except Exception as e:
        print(f"[tap-management] Error invalidando caché en Redis: {e}")

SECRET_KEY = os.getenv("SECRET_KEY", "supersecret_beerflow_key")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login") # Using billing-service url for swagger

async def get_current_admin_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        role: str = payload.get("role")
        if role != "ADMIN":
            raise HTTPException(status_code=403, detail="Not enough privileges")
        return payload
    except jwt.PyJWTError:
        raise credentials_exception

@router.post("/taps/{tap_id}/kegs/replace", response_model=KegResponse)
async def replace_keg(tap_id: str, db: AsyncSession = Depends(get_db), admin: dict = Depends(get_current_admin_user)):
    # Query the tap by its tap_code
    result = await db.execute(select(Tap).where(Tap.tap_code == tap_id))
    tap = result.scalar_one_or_none()
    if not tap:
        raise HTTPException(status_code=404, detail="Tap not found")
    
    # Create new keg
    new_keg = Keg(
        name=f"Barril {tap.name or tap.tap_code}",
        beer_style=None,
        capacity_ml=25000,
        remaining_ml=25000
    )
    db.add(new_keg)
    await db.flush() # get new_keg.id
    
    # Associate new keg to the tap
    tap.keg_id = new_keg.id
    db.add(tap)
    await db.commit()
    await db.refresh(new_keg)
    await invalidate_tap_cache(tap_id)
    return new_keg

@router.get("/taps/stock", response_model=list[StockStatusResponse])
async def get_stock(db: AsyncSession = Depends(get_db), admin: dict = Depends(get_current_admin_user)):
    # Get all taps and active kegs
    result_taps = await db.execute(select(Tap).options(joinedload(Tap.keg)))
    taps = result_taps.scalars().all()
    
    stock_status = []
    for tap in taps:
        keg = tap.keg
        current_vol = float(keg.remaining_ml) if keg else 0.0
        capacity = float(keg.capacity_ml) if keg else 25000.0
        percentage = (current_vol / capacity) * 100 if keg else 0.0
        
        stock_status.append(
            StockStatusResponse(
                tap_id=tap.tap_code,
                name=tap.name or tap.tap_code,
                keg_id=keg.id if keg else None,
                current_volume_ml=current_vol,
                percentage_left=percentage,
                is_low_stock=percentage <= 10.0
            )
        )
    return stock_status


@router.get("/kegs", response_model=list[KegResponse])
async def get_kegs(db: AsyncSession = Depends(get_db), admin: dict = Depends(get_current_admin_user)):
    """Devuelve la lista de todos los barriles en el sistema."""
    result = await db.execute(select(Keg).order_by(Keg.created_at.desc()))
    return result.scalars().all()


@router.post("/kegs", response_model=KegResponse)
async def create_keg(payload: KegCreate, db: AsyncSession = Depends(get_db), admin: dict = Depends(get_current_admin_user)):
    """Crea un nuevo barril en el sistema."""
    remaining = payload.remaining_ml if payload.remaining_ml is not None else payload.capacity_ml
    keg = Keg(
        name=payload.name,
        beer_style=payload.beer_style,
        capacity_ml=payload.capacity_ml,
        remaining_ml=remaining
    )
    db.add(keg)
    await db.commit()
    await db.refresh(keg)
    return keg


@router.post("/taps", response_model=TapResponse)
async def create_tap(payload: TapCreate, db: AsyncSession = Depends(get_db), admin: dict = Depends(get_current_admin_user)):
    """Crea un nuevo grifo en el sistema."""
    # Verificar si el código ya existe
    existing = await db.execute(select(Tap).where(Tap.tap_code == payload.tap_code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tap code already exists")
    
    tap = Tap(
        tap_code=payload.tap_code,
        name=payload.name,
        price_per_ml=payload.price_per_ml,
        keg_id=payload.keg_id,
        is_active=True
    )
    db.add(tap)
    await db.commit()
    await db.refresh(tap)
    return tap


@router.patch("/taps/{tap_id}", response_model=TapResponse)
async def update_tap(tap_id: str, payload: TapUpdate, db: AsyncSession = Depends(get_db), admin: dict = Depends(get_current_admin_user)):
    """Actualiza la información de un grifo (p. ej. asociar barril, precio, nombre)."""
    result = await db.execute(select(Tap).where(Tap.tap_code == tap_id))
    tap = result.scalar_one_or_none()
    if not tap:
        raise HTTPException(status_code=404, detail="Tap not found")
    
    if payload.name is not None:
        tap.name = payload.name
    if payload.price_per_ml is not None:
        tap.price_per_ml = payload.price_per_ml
    if payload.keg_id is not None:
        tap.keg_id = payload.keg_id
    if payload.is_active is not None:
        tap.is_active = payload.is_active
        
    db.add(tap)
    await db.commit()
    await db.refresh(tap)
    await invalidate_tap_cache(tap_id)
    return tap


@router.delete("/taps/{tap_id}", status_code=204)
async def delete_tap(tap_id: str, db: AsyncSession = Depends(get_db), admin: dict = Depends(get_current_admin_user)):
    """Elimina un grifo del sistema."""
    result = await db.execute(select(Tap).where(Tap.tap_code == tap_id))
    tap = result.scalar_one_or_none()
    if not tap:
        raise HTTPException(status_code=404, detail="Tap not found")
    
    await db.delete(tap)
    await db.commit()
    
    # Invalidate cache in Redis
    await invalidate_tap_cache(tap_id)
    return None


@router.delete("/kegs/{keg_id}", status_code=204)
async def delete_keg(keg_id: str, db: AsyncSession = Depends(get_db), admin: dict = Depends(get_current_admin_user)):
    """Elimina un barril del sistema."""
    try:
        keg_uuid = uuid.UUID(keg_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")
        
    result = await db.execute(select(Keg).where(Keg.id == keg_uuid))
    keg = result.scalar_one_or_none()
    if not keg:
        raise HTTPException(status_code=404, detail="Keg not found")
        
    # Desasociar el barril de cualquier grifo que lo tenga asignado
    taps_result = await db.execute(select(Tap).where(Tap.keg_id == keg_uuid))
    taps = taps_result.scalars().all()
    for tap in taps:
        tap.keg_id = None
        db.add(tap)
        # Invalidar caché de ese grifo
        await invalidate_tap_cache(tap.tap_code)
        
    await db.delete(keg)
    await db.commit()
    return None


