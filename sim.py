import httpx, time

print("Unlocking tap-001...")
httpx.post("http://localhost:8080/api/beerflow/sensor/unlock", json={"tap_id": "tap-001", "customer_id": "test"})

print("Sending pulses...")
with httpx.Client() as client:
    resp = client.post("http://localhost:8080/api/beerflow/sensor/pulse", json={"tap_id": "tap-001", "pulses": 9, "timestamp": time.time()})
    print(resp.json())
