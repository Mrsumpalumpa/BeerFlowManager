from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Tap Management Service", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": "tap-management-service"}

@app.get("/taps/{tap_id}/price")
async def get_tap_price(tap_id: str):
    # TODO: Fase 4 — leer de PostgreSQL
    prices = {"tap-001": 0.0065, "tap-002": 0.0045}
    return {"tap_id": tap_id, "price_per_ml": prices.get(tap_id, 0.005)}
