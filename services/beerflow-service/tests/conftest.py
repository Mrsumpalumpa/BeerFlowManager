import pytest
import asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
import sys
import os

# Añadir el directorio padre al sys.path para poder importar main y routers
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app

class MockRedis:
    def __init__(self):
        self.store = {}
        self.published = []

    async def get(self, key: str):
        return self.store.get(key)

    async def setex(self, key: str, time: int, value: str):
        self.store[key] = str(value)
        return True

    async def delete(self, *keys: str):
        for key in keys:
            if key in self.store:
                del self.store[key]
        return True

    async def publish(self, channel: str, message: str):
        self.published.append({"channel": channel, "message": message})
        return 1

    async def aclose(self):
        pass

@pytest.fixture
def mock_redis():
    return MockRedis()

@pytest.fixture
async def client(mock_redis):
    # Reemplazamos la conexión de Redis real en app.state por nuestro mock
    app.state.redis = mock_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
