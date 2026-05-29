"""
Router: WebSocket /ws/{tap_id}
Emite el estado del grifo al frontend cada 200ms.
Detecta inactividad y cierra la sesión automáticamente.
"""
import asyncio
import json
import os
import time

import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

SESSION_TIMEOUT = int(os.getenv("SESSION_TIMEOUT_SECONDS", "3"))
BILLING_URL = os.getenv("BILLING_SERVICE_URL", "http://billing-service:8001")
BROADCAST_INTERVAL = 0.2  # segundos


@router.websocket("/ws/{tap_id}")
async def tap_websocket(websocket: WebSocket, tap_id: str):
    await websocket.accept()
    redis = websocket.app.state.redis
    tap_key = f"tap:{tap_id}"

    try:
        while True:
            raw = await redis.get(tap_key)
            if raw:
                state = json.loads(raw)
                now = time.time()
                idle_seconds = now - state.get("last_pulse_at", now)

                # Detectar cierre de grifo por inactividad
                if state["status"] == "open" and idle_seconds >= SESSION_TIMEOUT:
                    state["status"] = "closed"
                    await redis.setex(tap_key, 300, json.dumps(state))

                    # Notificar al billing-service para cobrar
                    asyncio.create_task(
                        _close_session(tap_id, state)
                    )

                await websocket.send_json(state)
            else:
                # Grifo sin sesión activa
                await websocket.send_json({
                    "tap_id": tap_id,
                    "ml_total": 0.0,
                    "price_current": 0.0,
                    "status": "idle",
                    "last_pulse_at": None,
                    "customer_id": None,
                })

            await asyncio.sleep(BROADCAST_INTERVAL)

    except WebSocketDisconnect:
        pass


async def _close_session(tap_id: str, state: dict):
    """Llama al billing-service para cerrar y cobrar la orden."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{BILLING_URL}/orders/close",
                json={
                    "tap_id": tap_id,
                    "customer_id": state.get("customer_id"),
                    "ml_served": state.get("ml_total", 0),
                    "total_amount": state.get("price_current", 0),
                },
            )
    except Exception as e:
        print(f"[beerflow] Error al cerrar sesión de {tap_id}: {e}")
