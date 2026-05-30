"""
sensor_simulator.py — Simula los pulsos del caudalímetro del ESP32
Úsalo durante el desarrollo para probar sin hardware real.

Uso:
    python sensor_simulator.py --tap-id tap-001 --flow-rate 100

Variables de entorno:
    BEERFLOW_URL        URL del beerflow-service (default: http://localhost:8000)
    TAP_ID              ID del grifo a simular (default: tap-001)
    PULSE_INTERVAL_MS   Intervalo de envío en ms (default: 200)
"""
import argparse
import os
import random
import time

import httpx

BEERFLOW_URL = os.getenv("BEERFLOW_URL", "http://localhost:8000")
TAP_ID = os.getenv("TAP_ID", "tap-001")
INTERVAL_MS = int(os.getenv("PULSE_INTERVAL_MS", "200"))

# YF-S201: ~450 pulsos/litro a caudal máximo (~1-30 L/min)
# A 100 ml/s tendríamos ~45 pulsos/segundo → ~9 pulsos cada 200ms
PULSES_PER_INTERVAL = 9


def simulate(tap_id: str, duration_seconds: int = 30):
    print(f"[simulator] Simulando grifo {tap_id} durante {duration_seconds}s")
    print(f"[simulator] Enviando a {BEERFLOW_URL}/sensor/pulse")

    start = time.time()
    total_ml = 0.0

    with httpx.Client(timeout=5.0) as client:
        while time.time() - start < duration_seconds:
            # Simula variación natural del caudal (±2 pulsos)
            pulses = PULSES_PER_INTERVAL + random.randint(-2, 2)
            pulses = max(1, pulses)

            try:
                resp = client.post(
                    f"{BEERFLOW_URL}/sensor/pulse",
                    json={
                        "tap_id": tap_id,
                        "pulses": pulses,
                        "timestamp": time.time(),
                    },
                )
                if resp.status_code != 200:
                    try:
                        err_msg = resp.json().get("detail", "Error desconocido")
                    except Exception:
                        err_msg = resp.text
                    print(f"\n[simulator] ❌ Error del servidor ({resp.status_code}): {err_msg}")
                    break

                data = resp.json()
                total_ml = data.get("ml_total", total_ml)
                print(
                    f"  pulses={pulses:2d}  "
                    f"ml_total={total_ml:6.1f}  "
                    f"price=€{data.get('price', 0):.4f}"
                )
            except Exception as e:
                print(f"[simulator] Error de conexión: {e}")

            time.sleep(INTERVAL_MS / 1000)

    print(f"\n[simulator] Fin. Total servido: {total_ml:.1f} ml")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BeerFlow sensor simulator")
    parser.add_argument("--tap-id", default=TAP_ID)
    parser.add_argument("--duration", type=int, default=30, help="Segundos de simulación")
    args = parser.parse_args()

    simulate(args.tap_id, args.duration)
