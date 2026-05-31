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

SESSION_TIMEOUT = int(os.getenv("SESSION_TIMEOUT_SECONDS", "5"))
CLOSED_STATE_TTL = 30  # Mantener estado 'closed' visible durante 30s
BILLING_URL = os.getenv("BILLING_SERVICE_URL", "http://billing-service:8001")
BROADCAST_INTERVAL = 0.2  # segundos


@router.websocket("/ws/{tap_id}")
async def tap_websocket(websocket: WebSocket, tap_id: str):
    await websocket.accept()
    redis = websocket.app.state.redis
    tap_key = f"tap:{tap_id}"

    state = None
    try:
        while True:
            raw = await redis.get(tap_key)
            if raw:
                state = json.loads(raw)
                now = time.time()
                idle_seconds = now - state.get("last_pulse_at", now)

                # La inactividad y cierre automático (SESSION_TIMEOUT) ahora es
                # gestionada por el background task `cleanup_idle_sessions` en main.py

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
        # Si el cliente cierra el WebSocket (ej. cambia de grifo en la UI),
        # cerramos y cobramos la sesión activa inmediatamente si estaba abierta.
        if state and state.get("status") == "open":
            state["status"] = "closed"
            await redis.setex(tap_key, CLOSED_STATE_TTL, json.dumps(state))
            await _close_session(tap_id, state, redis)



async def _close_session(tap_id: str, state: dict, redis):
    """Llama al billing-service para cerrar y cobrar la orden, descuenta stock y limpia caché."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{BILLING_URL}/orders/close",
                json={
                    "tap_id": tap_id,
                    "customer_id": state.get("customer_id"),
                    "keg_id": state.get("keg_id") or "no-keg",
                    "beer_style": state.get("beer_style", "Cerveza"),
                    "ml_served": state.get("ml_total", 0),
                    "total_amount": state.get("price_current", 0),
                },
            )
    except Exception as e:
        print(f"[beerflow] Error al cerrar sesión de {tap_id} en billing-service: {e}")

    # Descontar volumen consumido en Postgres a través de tap-management-service
    keg_id_key = f"keg:id:{tap_id}"
    keg_vol_key = f"keg:remaining:{tap_id}"
    keg_style_key = f"keg:style:{tap_id}"
    price_key = f"tap_price:{tap_id}"

    keg_id = await redis.get(keg_id_key)
    ml_served = state.get("ml_total", 0.0)

    if keg_id and keg_id != "no-keg" and ml_served > 0:
        try:
            TAP_MANAGEMENT_URL = os.getenv("TAP_MANAGEMENT_URL", "http://tap-management-service:8002")
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{TAP_MANAGEMENT_URL}/kegs/{keg_id}/consume",
                    params={"ml_consumed": ml_served}
                )
                if resp.status_code == 200:
                    print(f"[beerflow] Stock en Postgres descontado con éxito para barril {keg_id}: -{ml_served} ml")
                else:
                    print(f"[beerflow] Error al descontar stock en Postgres: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"[beerflow] Excepción al actualizar stock en Postgres: {e}")

    # Invalidar claves de caché en Redis para que el próximo grifo activo recupere datos frescos de BD
    keg_cap_key = f"keg:capacity:{tap_id}"
    await redis.delete(keg_id_key)
    await redis.delete(keg_vol_key)
    await redis.delete(keg_cap_key)
    await redis.delete(keg_style_key)
    await redis.delete(price_key)

