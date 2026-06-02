import httpx, time

with httpx.Client(timeout=5.0) as client:
    resp = client.post(
        "http://localhost:8080/api/beerflow/sensor/pulse",
        json={"tap_id": "tap-002", "pulses": 9, "timestamp": time.time()},
    )
    print(resp.status_code)
    print(resp.text)
