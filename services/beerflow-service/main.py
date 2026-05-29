"""
beerflow-service — Servicio principal IoT + tiempo real
"""
import asyncio
import json
import os
from contextlib import asynccontextmanager

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
    yield
    await app.state.redis.aclose()


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
