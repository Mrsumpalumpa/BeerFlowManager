import httpx

payload = {
    "tap_id": "tap-001",
    "customer_id": 1,
    "keg_id": "keg-1",
    "beer_style": "IPA",
    "ml_served": 500.0,
    "total_amount": 3.25
}
resp = httpx.post("http://localhost:8080/api/billing/orders/close", json=payload)
print(resp.json())
