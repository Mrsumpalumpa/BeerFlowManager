import asyncio
import json
import logging
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import redis.asyncio as aioredis

router = APIRouter()
logger = logging.getLogger("tap_management.admin_ws")

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
ALERTS_CHANNEL = "admin:alerts"


@router.websocket("/ws/admin")
async def admin_websocket(websocket: WebSocket):
    await websocket.accept()

    redis_client = None
    pubsub = None

    try:
        redis_client = await aioredis.from_url(REDIS_URL, decode_responses=True)
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(ALERTS_CHANNEL)
        logger.info("[admin_ws] Cliente conectado. Escuchando canal 'admin:alerts'.")

        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                try:
                    data = json.loads(message["data"])
                    await websocket.send_json(data)
                except Exception as e:
                    logger.warning(f"[admin_ws] Error procesando mensaje: {e}")
            else:
                await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        logger.info("[admin_ws] Cliente desconectado.")
    except Exception as e:
        logger.error(f"[admin_ws] Error inesperado: {e}")
    finally:
        # Limpieza segura — ignorar errores si Redis ya está caído
        if pubsub:
            try:
                await pubsub.unsubscribe(ALERTS_CHANNEL)
                await pubsub.aclose()
            except Exception:
                pass
        if redis_client:
            try:
                await redis_client.aclose()
            except Exception:
                pass

