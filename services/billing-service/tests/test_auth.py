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
    # Register a user first
    await client.post("/auth/register", json={"username": "testclose", "password": "pwd", "role": "CUSTOMER"})
    
    payload = {
        "tap_id": "tap-001",
        "customer_id": "testclose",
        "keg_id": "keg-1",
        "beer_style": "IPA",
        "ml_served": 500,
        "total_amount": 3.25
    }
    resp = await client.post("/orders/close", json=payload)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "order_id": None}

@pytest.mark.asyncio
async def test_metrics(client):
    # Ensure there's a user and a consumption
    await client.post("/auth/register", json={"username": "metricuser", "password": "pwd", "role": "CUSTOMER"})
    await client.post("/orders/close", json={
        "tap_id": "tap-metrics",
        "customer_id": "metricuser",
        "keg_id": "keg-metrics",
        "beer_style": "Stout",
        "ml_served": 1000,
        "total_amount": 6.50
    })
    
    resp = await client.get("/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert "top_customers" in data
    assert "beer_styles" in data
    assert "recent" in data
    
    # Check if the Stout was recorded
    assert any(b["beer_style"] == "Stout" and b["total_ml"] >= 1000 for b in data["beer_styles"])
    assert any(c["username"] == "metricuser" and c["total_ml"] >= 1000 for c in data["top_customers"])

@pytest.mark.asyncio
async def test_get_users_admin(client):
    # Register an admin
    await client.post("/auth/register", json={"username": "testadmin", "password": "adminpass", "role": "ADMIN"})
    # Register a customer
    await client.post("/auth/register", json={"username": "testcust", "password": "custpass", "role": "CUSTOMER"})
    
    # Login admin
    resp_login = await client.post("/auth/login", data={"username": "testadmin", "password": "adminpass"})
    token = resp_login.json()["access_token"]
    
    # Get users
    resp_users = await client.get("/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert resp_users.status_code == 200
    users = resp_users.json()
    assert len(users) >= 2
    assert any(u["username"] == "testadmin" for u in users)
    assert any(u["username"] == "testcust" for u in users)

@pytest.mark.asyncio
async def test_generate_qr_token(client):
    # Register an admin
    await client.post("/auth/register", json={"username": "adminqr", "password": "adminpass", "role": "ADMIN"})
    resp_reg = await client.post("/auth/register", json={"username": "custqr", "password": "custpass", "role": "CUSTOMER"})
    cust_id = resp_reg.json()["id"]
    
    # Login admin
    resp_login = await client.post("/auth/login", data={"username": "adminqr", "password": "adminpass"})
    token = resp_login.json()["access_token"]
    
    # Generate QR Token
    resp_qr = await client.post(f"/auth/users/{cust_id}/qr-token", headers={"Authorization": f"Bearer {token}"})
    assert resp_qr.status_code == 200
    qr_data = resp_qr.json()
    assert "access_token" in qr_data
    assert qr_data["token_type"] == "bearer"
    assert qr_data["role"] == "CUSTOMER"

