import pytest
from httpx import ASGITransport, AsyncClient

from organella_core.main import app


@pytest.mark.asyncio
async def test_auth_login_and_me():
    """Test login with seeded doctor user and retrieve profile"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login with seeded credentials
        login_resp = await client.post(
            "/api/v1/auth/login",
            data={"username": "dr.thanakorn", "password": "doctor12345"},
        )
        assert login_resp.status_code == 200, login_resp.text
        token_data = login_resp.json()
        assert "access_token" in token_data
        token = token_data["access_token"]
        assert token_data["user"]["username"] == "dr.thanakorn"
        assert "patient:read" in token_data["user"]["permissions"]
        assert "patient:write" in token_data["user"]["permissions"]

        # 2. Access /me endpoint with Bearer token
        headers = {"Authorization": f"Bearer {token}"}
        me_resp = await client.get("/api/v1/auth/me", headers=headers)
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data["full_name"] == "นพ. ธนากร วงศ์วิจิตร"
        assert me_data["license_number"] == "ว.45892"


@pytest.mark.asyncio
async def test_patient_mpi_lifecycle_and_audit():
    """Test patient registration, retrieval, and FHIR R4 transformation"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Login as doctor
        login_resp = await client.post(
            "/api/v1/auth/login",
            data={"username": "dr.thanakorn", "password": "doctor12345"},
        )
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Register a new Patient
        patient_payload = {
            "hn": "679901",
            "citizen_id": "1-9988-77665-43-2",
            "prefix": "นางสาว",
            "first_name": "กานดา",
            "last_name": "เจริญผล",
            "gender": "female",
            "birth_date": "1992-08-20",
            "blood_group": "B Positive",
            "allergies": ["Amoxicillin"],
            "contact_info": {"phone": "081-234-5678"},
            "address": {"province": "กรุงเทพมหานคร"},
            "is_active": True,
        }

        # Handle case if already created in previous runs
        create_resp = await client.post("/api/v1/patients", json=patient_payload, headers=headers)
        if create_resp.status_code == 400 and "already exists" in create_resp.text:
            get_resp = await client.get("/api/v1/patients/679901", headers=headers)
            patient_id = get_resp.json()["id"]
        else:
            assert create_resp.status_code == 201, create_resp.text
            patient_data = create_resp.json()
            assert patient_data["hn"] == "679901"
            assert patient_data["first_name"] == "กานดา"
            patient_id = patient_data["id"]

        # 2. Search Patient by name query
        search_resp = await client.get("/api/v1/patients?q=กานดา", headers=headers)
        assert search_resp.status_code == 200
        search_data = search_resp.json()
        assert search_data["total"] >= 1
        assert any(p["hn"] == "679901" for p in search_data["items"])

        # 3. Retrieve Patient by HN
        chart_resp = await client.get("/api/v1/patients/679901", headers=headers)
        assert chart_resp.status_code == 200
        assert chart_resp.json()["id"] == patient_id

        # 4. HL7 FHIR R4 Endpoint test
        fhir_resp = await client.get(f"/fhir/r4/Patient/{patient_id}")
        assert fhir_resp.status_code == 200
        assert fhir_resp.headers["content-type"].startswith("application/fhir+json")
        fhir_json = fhir_resp.json()
        assert fhir_json["resourceType"] == "Patient"
        assert fhir_json["id"] == patient_id
        assert fhir_json["gender"] == "female"
        assert fhir_json["birthDate"] == "1992-08-20"
        assert fhir_json["name"][0]["family"] == "เจริญผล"
        assert "กานดา" in fhir_json["name"][0]["given"]

        # 5. HL7 FHIR R4 Search Bundle test
        bundle_resp = await client.get("/fhir/r4/Patient?identifier=679901")
        assert bundle_resp.status_code == 200
        bundle_json = bundle_resp.json()
        assert bundle_json["resourceType"] == "Bundle"
        assert bundle_json["type"] == "searchset"
        assert bundle_json["total"] >= 1
        assert bundle_json["entry"][0]["resource"]["id"] == patient_id


@pytest.mark.asyncio
async def test_fhir_metadata_capability_statement():
    """Test FHIR CapabilityStatement endpoint"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/fhir/r4/metadata")
        assert resp.status_code == 200
        data = resp.json()
        assert data["resourceType"] == "CapabilityStatement"
        assert data["fhirVersion"] == "4.0.1"
        assert data["software"]["name"] == "Organella Generic Health Engine"
