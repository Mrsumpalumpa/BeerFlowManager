import pytest
import uuid

@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "tap-management-service"}

@pytest.mark.asyncio
async def test_get_all_taps(client):
    response = await client.get("/taps")
    assert response.status_code == 200
    taps = response.json()
    assert len(taps) >= 2
    
    # Verificar estructura de tap-001
    tap1 = next((t for t in taps if t["tap_code"] == "tap-001"), None)
    assert tap1 is not None
    assert tap1["name"] == "Grifo 1"
    assert tap1["price_per_ml"] == 0.0065
    assert tap1["is_blocked"] is False
    assert tap1["percentage_left"] == 100.0

@pytest.mark.asyncio
async def test_get_tap_price(client):
    response = await client.get("/taps/tap-001/price")
    assert response.status_code == 200
    data = response.json()
    assert data["tap_id"] == "tap-001"
    assert data["price_per_ml"] == 0.0065

    response_nonexistent = await client.get("/taps/nonexistent/price")
    assert response_nonexistent.status_code == 200
    data_nonexistent = response_nonexistent.json()
    assert data_nonexistent["tap_id"] == "nonexistent"
    assert data_nonexistent["price_per_ml"] == 0.005 # fallback

@pytest.mark.asyncio
async def test_get_active_keg_success(client):
    response = await client.get("/taps/tap-001/active-keg")
    assert response.status_code == 200
    data = response.json()
    assert data["tap_id"] == "tap-001"
    assert data["price_per_ml"] == 0.0065
    assert data["keg_id"] is not None
    assert data["capacity_ml"] == 25000
    assert data["remaining_ml"] == 25000

@pytest.mark.asyncio
async def test_get_active_keg_not_found(client):
    response = await client.get("/taps/nonexistent/active-keg")
    assert response.status_code == 404
    assert response.json()["detail"] == "Tap not found"

@pytest.mark.asyncio
async def test_consume_keg_success(client):
    # 1. Obtener el ID del barril activo
    response = await client.get("/taps/tap-001/active-keg")
    assert response.status_code == 200
    keg_id = response.json()["keg_id"]
    assert keg_id is not None

    # 2. Consumir 1500 ml de ese barril
    consume_payload = {"ml_consumed": 1500.0}
    response_consume = await client.post(f"/kegs/{keg_id}/consume", params=consume_payload)
    assert response_consume.status_code == 200
    consume_data = response_consume.json()
    assert consume_data["keg_id"] == keg_id
    assert consume_data["remaining_ml"] == 23500 # 25000 - 1500

    # 3. Comprobar que el volumen restante se actualizó en la API pública de grifos
    response_taps = await client.get("/taps")
    assert response_taps.status_code == 200
    taps = response_taps.json()
    tap1 = next((t for t in taps if t["tap_code"] == "tap-001"), None)
    assert tap1["percentage_left"] == (23500 / 25000) * 100.0

@pytest.mark.asyncio
async def test_consume_keg_not_found(client):
    random_uuid = str(uuid.uuid4())
    response = await client.post(f"/kegs/{random_uuid}/consume", params={"ml_consumed": 100})
    assert response.status_code == 404
    assert response.json()["detail"] == "Keg not found"
