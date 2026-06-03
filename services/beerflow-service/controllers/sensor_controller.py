import json
import os
import time
import httpx

ML_PER_PULSE = float(os.getenv("ML_PER_PULSE", "2.25"))
TAP_MANAGEMENT_URL = os.getenv("TAP_MANAGEMENT_URL", "http://tap-management-service:8002")

class SensorValidationError(Exception):
    pass

class SensorAuthError(Exception):
    pass

async def _get_price_per_ml(redis, tap_id: str) -> float:
    """Recupera el precio del grifo desde Redis (cacheado por tap-management-service)."""
    price_key = f"tap_price:{tap_id}"
    price = await redis.get(price_key)
    return float(price) if price else 0.0065  # fallback €/ml


async def process_pulse(tap_id: str, pulses: int, timestamp: float | None, redis) -> dict:
    tap_key = f"tap:{tap_id}"
    now = timestamp or time.time()

    # Cargar información del barril y precio de Redis o de tap-management-service
    keg_id_key = f"keg:id:{tap_id}"
    keg_vol_key = f"keg:remaining:{tap_id}"
    keg_cap_key = f"keg:capacity:{tap_id}"
    keg_style_key = f"keg:style:{tap_id}"
    price_key = f"tap_price:{tap_id}"

    keg_id = await redis.get(keg_id_key)
    keg_vol_raw = await redis.get(keg_vol_key)
    keg_cap_raw = await redis.get(keg_cap_key)

    if keg_id is None or keg_vol_raw is None or keg_cap_raw is None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{TAP_MANAGEMENT_URL}/taps/{tap_id}/active-keg")
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
            print(f"[beerflow] Error fetching active keg for {tap_id}: {e}")
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
        raise SensorValidationError("El grifo no tiene ningún barril asociado.")
    
    if keg_vol < (keg_cap * 0.05):
        raise SensorValidationError(f"Grifo bloqueado: el barril tiene menos del 5% de capacidad ({keg_vol:.1f} ml / {keg_cap:.1f} ml).")

    # Leer estado actual
    raw = await redis.get(tap_key)
    
    if not raw:
        raise SensorAuthError("El grifo está bloqueado. Por favor, autentícate primero escaneando tu QR.")
        
    state = json.loads(raw)
    
    if state.get("status") != "open" or not state.get("customer_id"):
        raise SensorAuthError("El grifo está bloqueado. Por favor, autentícate primero escaneando tu QR.")

    # Asignar estilo de cerveza y keg_id al estado de la sesión
    state["keg_id"] = keg_id if keg_id != "no-keg" else None
    state["beer_style"] = style

    # Calcular incremento
    ml_increment = pulses * ML_PER_PULSE
    state["ml_total"] = round(state["ml_total"] + ml_increment, 2)
    state["last_pulse_at"] = now
    state["status"] = "open"

    # Obtener precio y calcular total actual
    price_per_ml = await _get_price_per_ml(redis, tap_id)
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
                "tap_id": tap_id,
                "current_volume_ml": round(keg_vol, 2)
            }))

    return {"ok": True, "ml_total": state["ml_total"], "price": state["price_current"]}

async def process_unlock(tap_id: str, customer_id: str, redis) -> dict:
    tap_key = f"tap:{tap_id}"
    now = time.time()
    
    # Initialize a new session
    state = {
        "tap_id": tap_id,
        "ml_total": 0.0,
        "price_current": 0.0,
        "status": "open",
        "last_pulse_at": now,
        "customer_id": customer_id,
    }
    
    await redis.setex(tap_key, 300, json.dumps(state))
    return {"ok": True, "message": "Grifo desbloqueado exitosamente"}
