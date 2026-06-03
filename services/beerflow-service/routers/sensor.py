"""
Router: /sensor — Recibe pulsos del ESP32 (o simulador) via HTTP
Topic MQTT alternativo: beerflow/taps/{tap_id}/pulses
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from controllers.sensor_controller import (
    process_pulse,
    process_unlock,
    SensorValidationError,
    SensorAuthError,
)

router = APIRouter()


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
    try:
        return await process_pulse(
            tap_id=payload.tap_id,
            pulses=payload.pulses,
            timestamp=payload.timestamp,
            redis=redis
        )
    except SensorValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SensorAuthError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/unlock")
async def unlock_tap(
    payload: UnlockPayload,
    redis=Depends(get_redis),
):
    """
    Desbloquea el grifo para un cliente específico.
    """
    try:
        return await process_unlock(
            tap_id=payload.tap_id,
            customer_id=payload.customer_id,
            redis=redis
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
