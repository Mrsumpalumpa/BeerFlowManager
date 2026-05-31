import pytest

@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "billing-service"}

@pytest.mark.asyncio
async def test_register_and_login_success(client):
    # 1. Registrar un nuevo usuario
    register_payload = {
        "username": "testuser",
        "password": "mysecretpassword",
        "role": "CUSTOMER"
    }
    resp_register = await client.post("/auth/register", json=register_payload)
    assert resp_register.status_code == 200
    reg_data = resp_register.json()
    assert reg_data["username"] == "testuser"
    assert reg_data["role"] == "CUSTOMER"
    assert "id" in reg_data

    # 2. Hacer login con las credenciales creadas
    login_payload = {
        "username": "testuser",
        "password": "mysecretpassword"
    }
    # OAuth2PasswordRequestForm usa form data (x-www-form-urlencoded)
    resp_login = await client.post("/auth/login", data=login_payload)
    assert resp_login.status_code == 200
    login_data = resp_login.json()
    assert "access_token" in login_data
    assert login_data["token_type"] == "bearer"
    assert login_data["role"] == "CUSTOMER"

@pytest.mark.asyncio
async def test_register_duplicate_username(client):
    payload = {
        "username": "dupuser",
        "password": "password123",
        "role": "CUSTOMER"
      }
    resp1 = await client.post("/auth/register", json=payload)
    assert resp1.status_code == 200

    resp2 = await client.post("/auth/register", json=payload)
    assert resp2.status_code == 400
    assert "already registered" in resp2.json()["detail"]

@pytest.mark.asyncio
async def test_login_invalid_credentials(client):
    # Intentar hacer login de un usuario que no existe
    login_payload = {
        "username": "nonexistent",
        "password": "somepassword"
    }
    resp = await client.post("/auth/login", data=login_payload)
    assert resp.status_code == 401
    assert "Incorrect username or password" in resp.json()["detail"]

@pytest.mark.asyncio
async def test_close_order(client):
    payload = {
        "tap_id": "tap-001",
        "customer_id": "some-id",
        "ml_served": 500,
        "total_amount": 3.25
    }
    resp = await client.post("/orders/close", json=payload)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "order_id": None}
