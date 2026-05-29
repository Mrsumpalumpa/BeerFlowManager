from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Billing Service", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": "billing-service"}

@app.post("/orders/close")
async def close_order(payload: dict):
    # TODO: Fase 4 — descontar saldo y generar recibo
    print(f"[billing] Cerrando orden: {payload}")
    return {"ok": True, "order_id": None}
