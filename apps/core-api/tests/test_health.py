import pytest
from httpx import ASGITransport, AsyncClient

from organella_core.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["app"] == "Organella"


@pytest.mark.asyncio
async def test_system_info_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/system/info")
        assert response.status_code == 200
        data = response.json()
        assert "HL7 FHIR R4" in data["standards"]
        assert data["license"] == "AGPL-3.0"
