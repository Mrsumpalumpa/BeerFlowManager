import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import httpx
import json

@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "beerflow-service"}

@pytest.mark.asyncio
@patch("routers.sensor.httpx.AsyncClient")
async def test_receive_pulse_success(mock_client_class, client, mock_redis):
    # Configurar mock de httpx.AsyncClient
    mock_client = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "keg_id": "keg-123",
        "remaining_ml": 10000.0,
        "capacity_ml": 25000.0,
        "price_per_ml": 0.005,
        "beer_style": "IPA"
    }
    mock_client.get.return_value = mock_resp
    
    # Hacer que la llamada al gestor de contexto retorne nuestro mock_client
    mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)

    # Enviar un pulso de 10 unidades. A 2.25 ml por pulso, es 22.5 ml.
    payload = {
        "tap_id": "tap-001",
        "pulses": 10
    }
    
    response = await client.post("/sensor/pulse", json=payload)
    
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["ok"] is True
    assert res_data["ml_total"] == 22.5
    assert res_data["price"] == round(22.5 * 0.005, 4)

    # Verificar que los datos se cachearon en Redis
    assert await mock_redis.get("keg:id:tap-001") == "keg-123"
    assert float(await mock_redis.get("keg:remaining:tap-001")) == 9977.5 # 10000 - 22.5

@pytest.mark.asyncio
@patch("routers.sensor.httpx.AsyncClient")
async def test_receive_pulse_no_keg_error(mock_client_class, client, mock_redis):
    mock_client = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "keg_id": "no-keg",
        "remaining_ml": 0.0,
        "capacity_ml": 25000.0,
        "price_per_ml": 0.0,
        "beer_style": "Ninguna"
    }
    mock_client.get.return_value = mock_resp
    mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)

    payload = {
        "tap_id": "tap-001",
        "pulses": 5
    }
    
    response = await client.post("/sensor/pulse", json=payload)
    assert response.status_code == 400
    assert "no tiene ningún barril" in response.json()["detail"]

@pytest.mark.asyncio
@patch("routers.sensor.httpx.AsyncClient")
async def test_receive_pulse_low_stock_block(mock_client_class, client, mock_redis):
    mock_client = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "keg_id": "keg-empty",
        "remaining_ml": 1000.0, # 1000 ml de 25000 es 4% (menor que el 5% requerido)
        "capacity_ml": 25000.0,
        "price_per_ml": 0.005,
        "beer_style": "Pilsen"
    }
    mock_client.get.return_value = mock_resp
    mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)

    payload = {
        "tap_id": "tap-001",
        "pulses": 5
    }
    
    response = await client.post("/sensor/pulse", json=payload)
    assert response.status_code == 400
    assert "bloqueado" in response.json()["detail"]

@pytest.mark.asyncio
@patch("routers.sensor.httpx.AsyncClient")
async def test_receive_pulse_publishes_alert(mock_client_class, client, mock_redis):
    mock_client = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    # Stock justo arriba de 5%, ej. 2510 ml (10.04% de 25000ml)
    # Al restar los pulsos (10 pulsos * 2.25ml = 22.5ml), bajará a 2487.5ml, lo que es menor o igual a 2500ml (alerta stock bajo)
    mock_resp.json.return_value = {
        "keg_id": "keg-low",
        "remaining_ml": 2510.0,
        "capacity_ml": 25000.0,
        "price_per_ml": 0.005,
        "beer_style": "Amber"
    }
    mock_client.get.return_value = mock_resp
    mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)

    payload = {
        "tap_id": "tap-001",
        "pulses": 10
    }

    response = await client.post("/sensor/pulse", json=payload)
    assert response.status_code == 200
    
    # Verificar que se publicó la alerta a Redis
    assert len(mock_redis.published) == 1
    alert = mock_redis.published[0]
    assert alert["channel"] == "admin:alerts"
    
    alert_msg = json.loads(alert["message"])
    assert alert_msg["type"] == "LOW_STOCK"
    assert alert_msg["tap_id"] == "tap-001"
    assert alert_msg["current_volume_ml"] == 2487.5
