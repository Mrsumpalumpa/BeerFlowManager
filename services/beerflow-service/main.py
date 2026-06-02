"""
beerflow-service — Servicio principal IoT + tiempo real
"""
import asyncio
import json
import os
from contextlib import asynccontextmanager

import time
import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from routers import sensor, websocket as ws_router

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
ML_PER_PULSE = float(os.getenv("ML_PER_PULSE", "2.25"))
SESSION_TIMEOUT = int(os.getenv("SESSION_TIMEOUT_SECONDS", "3"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    task = asyncio.create_task(cleanup_idle_sessions(app))
    yield
    task.cancel()
    await app.state.redis.aclose()

async def cleanup_idle_sessions(app: FastAPI):
    from routers.websocket import _close_session, CLOSED_STATE_TTL
    while True:
        try:
            await asyncio.sleep(1.0)
            redis_client = app.state.redis
            keys = await redis_client.keys("tap:*")
            for key in keys:
                raw = await redis_client.get(key)
                if raw:
                    state = json.loads(raw)
                    if state.get("status") == "open":
                        now = time.time()
                        idle_seconds = now - state.get("last_pulse_at", now)
                        if idle_seconds >= SESSION_TIMEOUT:
                            state["status"] = "closed"
                            await redis_client.setex(key, CLOSED_STATE_TTL, json.dumps(state))
                            asyncio.create_task(_close_session(state["tap_id"], state, redis_client))
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[beerflow-service] Error en background cleanup task: {e}")


app = FastAPI(title="BeerFlow Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sensor.router, prefix="/sensor", tags=["sensor"])
app.include_router(ws_router.router, tags=["websocket"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "beerflow-service"}
