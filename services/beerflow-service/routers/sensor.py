"""
Router: /sensor — Recibe pulsos del ESP32 (o simulador) via HTTP
Topic MQTT alternativo: beerflow/taps/{tap_id}/pulses
"""
import json
import os
import time
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()

ML_PER_PULSE = float(os.getenv("ML_PER_PULSE", "2.25"))
TAP_MANAGEMENT_URL = os.getenv("TAP_MANAGEMENT_URL", "http://tap-management-service:8002")


class PulsePayload(BaseModel):
    tap_id: str
    pulses: int                  # pulsos recibidos en este intervalo
    timestamp: float | None = None

class UnlockPayload(BaseModel):
    tap_id: str
    customer_id: str


async def get_redis(request: Request):
    return request.app.state.redis


@router.post("/pulse")
async def receive_pulse(
    payload: PulsePayload,
    redis=Depends(get_redis),
):
    """
    Recibe pulsos del caudalímetro y actualiza el estado del grifo en Redis.
    El WebSocket lee este estado y lo emite al frontend cada 200ms.
    """
    tap_key = f"tap:{payload.tap_id}"
    now = payload.timestamp or time.time()

    # Cargar información del barril y precio de Redis o de tap-management-service
    keg_id_key = f"keg:id:{payload.tap_id}"
    keg_vol_key = f"keg:remaining:{payload.tap_id}"
    keg_cap_key = f"keg:capacity:{payload.tap_id}"
    keg_style_key = f"keg:style:{payload.tap_id}"
    price_key = f"tap_price:{payload.tap_id}"

    keg_id = await redis.get(keg_id_key)
    keg_vol_raw = await redis.get(keg_vol_key)
    keg_cap_raw = await redis.get(keg_cap_key)

    if keg_id is None or keg_vol_raw is None or keg_cap_raw is None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{TAP_MANAGEMENT_URL}/taps/{payload.tap_id}/active-keg")
                if resp.status_code == 200:
                    info = resp.json()
                    keg_id = info.get("keg_id") or "no-keg"
                    keg_vol = float(info.get("remaining_ml") or 0.0)
                    keg_cap = float(info.get("capacity_ml") or 25000.0)
                    price = float(info.get("price_per_ml") or 0.0065)
                    style = info.get("beer_style") or "Cerveza"

                    await redis.setex(keg_id_key, 300, keg_id)
                    await redis.setex(keg_vol_key, 300, str(keg_vol))
                    await redis.setex(keg_cap_key, 300, str(keg_cap))
                    await redis.setex(price_key, 300, str(price))
                    await redis.setex(keg_style_key, 300, style)
                else:
                    keg_id = "no-keg"
                    keg_vol = 0.0
                    keg_cap = 25000.0
                    style = "Cerveza"
        except Exception as e:
            print(f"[beerflow] Error fetching active keg for {payload.tap_id}: {e}")
            keg_id = "no-keg"
            keg_vol = 0.0
            keg_cap = 25000.0
            style = "Cerveza"
    else:
        keg_vol = float(keg_vol_raw)
        keg_cap = float(keg_cap_raw)
        style = await redis.get(keg_style_key) or "Cerveza"

    # Validar si el grifo tiene barril o si el volumen es menor al 5%
    if keg_id == "no-keg":
        raise HTTPException(
            status_code=400,
            detail="El grifo no tiene ningún barril asociado."
        )
    if keg_vol < (keg_cap * 0.05):
        raise HTTPException(
            status_code=400,
            detail=f"Grifo bloqueado: el barril tiene menos del 5% de capacidad ({keg_vol:.1f} ml / {keg_cap:.1f} ml)."
        )

    # Leer estado actual
    raw = await redis.get(tap_key)
    
    if not raw:
        raise HTTPException(
            status_code=403,
            detail="El grifo está bloqueado. Por favor, autentícate primero escaneando tu QR."
        )
        
    state = json.loads(raw)
    
    if state.get("status") != "open" or not state.get("customer_id"):
         raise HTTPException(
            status_code=403,
            detail="El grifo está bloqueado. Por favor, autentícate primero escaneando tu QR."
        )

    # Asignar estilo de cerveza y keg_id al estado de la sesión
    state["keg_id"] = keg_id if keg_id != "no-keg" else None
    state["beer_style"] = style


    # Calcular incremento
    ml_increment = payload.pulses * ML_PER_PULSE
    state["ml_total"] = round(state["ml_total"] + ml_increment, 2)
    state["last_pulse_at"] = now
    state["status"] = "open"

    # Obtener precio y calcular total actual
    price_per_ml = await _get_price_per_ml(redis, payload.tap_id)
    state["price_current"] = round(state["ml_total"] * price_per_ml, 4)

    await redis.setex(tap_key, 300, json.dumps(state))  # TTL 5 min

    # Descontar stock en caché de Redis
    if keg_id != "no-keg" and keg_vol > 0:
        keg_vol = max(0.0, keg_vol - ml_increment)
        await redis.setex(keg_vol_key, 300, str(keg_vol))

        # Notificar si el stock es bajo (<= 2.5L) o vacío
        if keg_vol <= 2500.0:
            alert_type = "EMPTY" if keg_vol == 0 else "LOW_STOCK"
            await redis.publish("admin:alerts", json.dumps({
                "type": alert_type,
                "tap_id": payload.tap_id,
                "current_volume_ml": round(keg_vol, 2)
            }))

    return {"ok": True, "ml_total": state["ml_total"], "price": state["price_current"]}



async def _get_price_per_ml(redis, tap_id: str) -> float:
    """Recupera el precio del grifo desde Redis (cacheado por tap-management-service)."""
    price_key = f"tap_price:{tap_id}"
    price = await redis.get(price_key)
    return float(price) if price else 0.0065  # fallback €/ml

@router.post("/unlock")
async def unlock_tap(
    payload: UnlockPayload,
    redis=Depends(get_redis),
):
    """
    Desbloquea el grifo para un cliente específico.
    """
    tap_key = f"tap:{payload.tap_id}"
    now = time.time()
    
    # Initialize a new session
    state = {
        "tap_id": payload.tap_id,
        "ml_total": 0.0,
        "price_current": 0.0,
        "status": "open",
        "last_pulse_at": now,
        "customer_id": payload.customer_id,
    }
    
    await redis.setex(tap_key, 300, json.dumps(state))
    return {"ok": True, "message": "Grifo desbloqueado exitosamente"}
