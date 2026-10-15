import pytest
from httpx import ASGITransport, AsyncClient

from organella_core.main import app
from organella_core.services.event_bus import publish_patient_event


@pytest.mark.asyncio
async def test_module_sync_and_catalog():
    """Test discovering and synchronizing local modules into DB and reading catalog"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Login as Admin (who has admin:modules permission)
        login_resp = await client.post(
            "/api/v1/auth/login",
            data={"username": "admin", "password": "admin12345"},
        )
        assert login_resp.status_code == 200
        admin_token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # 1. Sync modules from local filesystem
        sync_resp = await client.post("/api/v1/modules/sync", headers=headers)
        assert sync_resp.status_code == 200
        synced = sync_resp.json()
        assert len(synced) >= 1
        opd_mod = next((m for m in synced if m["module_id"] == "doctor-opd"), None)
        assert opd_mod is not None
        assert opd_mod["name"] == "Doctor OPD & Clinical Notes"
        assert opd_mod["is_enabled"] is True

        # 2. Get public active manifests (used by host-shell)
        active_resp = await client.get("/api/v1/modules/active-manifests")
        assert active_resp.status_code == 200
        active_manifests = active_resp.json()
        assert len(active_manifests) >= 1
        assert any(m["id"] == "doctor-opd" for m in active_manifests)

        # 3. Toggle module activation (Deactivate)
        toggle_off = await client.post(
            "/api/v1/modules/doctor-opd/toggle",
            json={"enabled": False},
            headers=headers,
        )
        assert toggle_off.status_code == 200
        assert toggle_off.json()["is_enabled"] is False

        # Active manifests should now exclude doctor-opd
        active_after_off = await client.get("/api/v1/modules/active-manifests")
        assert not any(m["id"] == "doctor-opd" for m in active_after_off.json())

        # Re-activate module
        toggle_on = await client.post(
            "/api/v1/modules/doctor-opd/toggle",
            json={"enabled": True},
            headers=headers,
        )
        assert toggle_on.status_code == 200
        assert toggle_on.json()["is_enabled"] is True


@pytest.mark.asyncio
async def test_redis_event_bus():
    """Verify Redis Event Bus publishes clinical events successfully"""
    success = await publish_patient_event(
        event_name="on_patient_admitted",
        patient_id="pat-test-01",
        hn="670099",
        details={"department": "OPD-MED"},
    )
    assert success is True
