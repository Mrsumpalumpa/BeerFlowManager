import os
# Establecer DATABASE_URL antes de importar main/modelos para que se aplique en todo el servicio
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///file:billingtest?mode=memory&cache=shared&uri=true"

import pytest
import asyncio
import sys
from httpx import AsyncClient, ASGITransport

# Añadir el directorio padre al sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app
from models.database import engine, Base

@pytest.fixture(autouse=True)
async def init_db():
    connection = await engine.connect()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await connection.close()

@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
