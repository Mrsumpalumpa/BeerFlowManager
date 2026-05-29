"""
Router: /sensor — Recibe pulsos del ESP32 (o simulador) via HTTP
Topic MQTT alternativo: beerflow/taps/{tap_id}/pulses
"""
import json
import os
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()

ML_PER_PULSE = float(os.getenv("ML_PER_PULSE", "2.25"))


class PulsePayload(BaseModel):
    tap_id: str
    pulses: int                  # pulsos recibidos en este intervalo
    timestamp: float | None = None


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

    # Leer estado actual
    raw = await redis.get(tap_key)
    state = json.loads(raw) if raw else {
        "tap_id": payload.tap_id,
        "ml_total": 0.0,
        "price_current": 0.0,
        "status": "open",
        "last_pulse_at": now,
        "customer_id": None,
    }

    # Calcular incremento
    ml_increment = payload.pulses * ML_PER_PULSE
    state["ml_total"] = round(state["ml_total"] + ml_increment, 2)
    state["last_pulse_at"] = now
    state["status"] = "open"

    # Obtener precio del grifo (simplificado — en prod consultar tap-management-service)
    price_per_ml = await _get_price_per_ml(redis, payload.tap_id)
    state["price_current"] = round(state["ml_total"] * price_per_ml, 4)

    await redis.setex(tap_key, 300, json.dumps(state))  # TTL 5 min

    return {"ok": True, "ml_total": state["ml_total"], "price": state["price_current"]}


async def _get_price_per_ml(redis, tap_id: str) -> float:
    """Recupera el precio del grifo desde Redis (cacheado por tap-management-service)."""
    price_key = f"tap_price:{tap_id}"
    price = await redis.get(price_key)
    return float(price) if price else 0.0065  # fallback €/ml
