import pytest
from httpx import ASGITransport, AsyncClient

from organella_core.main import app


@pytest.mark.asyncio
async def test_icd10_terminology_search():
    """Test ICD-10 terminology search endpoint for Doctor OPD module"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/modules/doctor-opd/icd10/search?q=J02")
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 1
        assert any(item["code"] == "J02.9" for item in data)


@pytest.mark.asyncio
async def test_opd_queue_and_consultation_workflow():
    """
    Test end-to-end OPD Queue retrieval, Consultation submission (SOAP + Vitals + ICD-10 + Rx),
    and HL7 FHIR R4 Encounter $everything Bundle generation.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Fetch OPD Queue (auto-seeds sample OPD patients & encounters if empty)
        q_res = await client.get("/api/v1/modules/doctor-opd/queue")
        assert q_res.status_code == 200
        queue = q_res.json()
        assert len(queue) >= 3

        first_patient = queue[0]
        patient_id = first_patient["patient_id"]
        encounter_number = first_patient["encounter_number"]

        # 2. Submit updated OPD Consultation (SOAP Note, Vital Signs, ICD-10, Medications)
        consultation_payload = {
            "encounter_number": encounter_number,
            "patient_id": patient_id,
            "encounter_type": "OPD",
            "status": "finished",
            "priority": "urgent",
            "department": "อายุรกรรมทั่วไป (OPD Med Rm.3)",
            "chief_complaint": "ไข้สูง เจ็บคอมาก กลืนลำบาก 2 วัน (ตรวจเสร็จสิ้น)",
            "vital_signs": {
                "bp_systolic": 128,
                "bp_diastolic": 80,
                "pulse": 84,
                "temperature": 37.8,
                "respiratory_rate": 18,
                "spo2": 99,
                "weight": 68.5,
                "height": 172.0,
            },
            "soap_note": {
                "subjective": "ผู้ป่วยอาการไข้ลดลงเล็กน้อย ยังเจ็บคอเวลากลืน",
                "objective": "Pharynx injected, no tonsillar exudate, lungs clear.",
                "assessment": "Acute pharyngitis with essential hypertension",
                "plan": "Continue Roxithromycin 150 mg bid pc and Paracetamol prn",
            },
            "conditions": [
                {
                    "icd10_code": "J02.9",
                    "icd10_display": "Acute pharyngitis, unspecified (คออักเสบเฉียบพลัน)",
                    "diagnosis_type": "principal",
                },
                {
                    "icd10_code": "I10",
                    "icd10_display": "Essential (primary) hypertension",
                    "diagnosis_type": "comorbidity",
                },
            ],
            "medications": [
                {
                    "medication_code": "RX-ROXI-150",
                    "medication_name": "Roxithromycin 150 mg Tablet",
                    "dosage_instruction": "1 tab PO bid ac",
                    "quantity": 14,
                    "unit": "tablet",
                },
                {
                    "medication_code": "RX-PARA-500",
                    "medication_name": "Paracetamol 500 mg Tablet",
                    "dosage_instruction": "1 tab PO q4-6h prn for fever",
                    "quantity": 20,
                    "unit": "tablet",
                },
            ],
        }

        save_res = await client.post(
            "/api/v1/modules/doctor-opd/encounters", json=consultation_payload
        )
        assert save_res.status_code == 201
        saved_enc = save_res.json()
        assert saved_enc["encounter_number"] == encounter_number
        assert saved_enc["status"] == "finished"
        assert len(saved_enc["conditions"]) == 2
        assert len(saved_enc["medications"]) == 2

        # 3. Verify HL7 FHIR R4 Encounter Resource
        fhir_enc_res = await client.get(f"/fhir/r4/Encounter/{encounter_number}")
        assert fhir_enc_res.status_code == 200
        assert "application/fhir+json" in fhir_enc_res.headers["content-type"]
        fhir_enc = fhir_enc_res.json()
        assert fhir_enc["resourceType"] == "Encounter"
        assert fhir_enc["status"] == "finished"
        assert fhir_enc["class"]["code"] == "AMB"

        # 4. Verify HL7 FHIR R4 Encounter $everything Bundle
        bundle_res = await client.get(f"/fhir/r4/Encounter/{encounter_number}/$everything")
        assert bundle_res.status_code == 200
        bundle = bundle_res.json()
        assert bundle["resourceType"] == "Bundle"
        assert bundle["type"] == "collection"
        assert bundle["total"] == 6  # 1 Patient + 1 Encounter + 2 Conditions + 2 MedicationRequests

        resource_types = [entry["resource"]["resourceType"] for entry in bundle["entry"]]
        assert resource_types.count("Patient") == 1
        assert resource_types.count("Encounter") == 1
        assert resource_types.count("Condition") == 2
        assert resource_types.count("MedicationRequest") == 2

        # 5. Verify FHIR R4 Condition & MedicationRequest search endpoints
        cond_search = await client.get(f"/fhir/r4/Condition?patient={patient_id}")
        assert cond_search.status_code == 200
        assert cond_search.json()["total"] >= 2

        med_search = await client.get(f"/fhir/r4/MedicationRequest?patient={patient_id}")
        assert med_search.status_code == 200
        assert med_search.json()["total"] >= 2
