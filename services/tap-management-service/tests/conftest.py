import os
# Establecer DATABASE_URL antes de importar main/modelos para que se aplique en todo el servicio
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///file:taptest?mode=memory&cache=shared&uri=true"

import pytest
import asyncio
import sys
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch

# Añadir el directorio padre al sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app, _seed_taps
from models.database import engine, Base

@pytest.fixture(autouse=True)
async def init_db():
    connection = await engine.connect()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_taps()
    yield
    await connection.close()

@pytest.fixture
async def client():
    # Mockear invalidate_tap_cache para evitar llamadas a Redis real durante los tests
    with patch("routers.admin_kegs.invalidate_tap_cache", new_callable=AsyncMock) as mock_invalidate:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.mock_invalidate_cache = mock_invalidate
            yield ac
