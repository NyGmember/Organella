import pytest
from httpx import ASGITransport, AsyncClient

from organella_core.main import app


@pytest.mark.asyncio
async def test_icd10_and_formulary_search():
    """Test ICD-10 and Drug Formulary search endpoints from Master Data tables"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Ensure seed data is loaded via queue endpoint
        await client.get("/api/v1/modules/doctor-opd/queue")

        res = await client.get("/api/v1/modules/doctor-opd/icd10/search?q=J02")
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 1
        assert any(item["code"] == "J02.9" for item in data)

        med_res = await client.get("/api/v1/modules/doctor-opd/medications/search?q=Roxithromycin")
        assert med_res.status_code == 200
        med_data = med_res.json()
        assert len(med_data) >= 1
        assert any(m["code"] == "RX-ROXI-150" for m in med_data)


@pytest.mark.asyncio
async def test_strict_role_list_guard_and_consultation_workflow():
    """
    Verify:
    1. Unauthenticated clinical sign-off is rejected (401).
    2. System Admin is strictly blocked from recording consultations/prescriptions on behalf of a doctor (403)
       and the error explicitly lists missing_roles.
    3. Triage Nurse can save Triage (200) but is blocked from signing SOAP/ICD-10/Rx (403 with missing_roles).
    4. Licensed Doctor with ['encounter:read', 'encounter:sign', 'condition:write', 'medication:prescribe']
       succeeds (201) and generates HL7 FHIR R4 $everything Bundle.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        q_res = await client.get("/api/v1/modules/doctor-opd/queue")
        assert q_res.status_code == 200
        queue = q_res.json()
        assert len(queue) >= 3

        first_patient = queue[0]
        patient_id = first_patient["patient_id"]
        encounter_number = first_patient["encounter_number"]

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

        # 1. Unauthenticated request MUST fail with 401
        unauth_res = await client.post(
            "/api/v1/modules/doctor-opd/encounters", json=consultation_payload
        )
        assert unauth_res.status_code == 401

        # 2. Login as Admin — Admin MUST NOT be allowed to save/sign on behalf of a doctor!
        admin_login = await client.post(
            "/api/v1/auth/login", data={"username": "admin", "password": "admin12345"}
        )
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        admin_attempt = await client.post(
            "/api/v1/modules/doctor-opd/encounters",
            json=consultation_payload,
            headers=admin_headers,
        )
        assert admin_attempt.status_code == 403
        admin_err = admin_attempt.json()["detail"]
        assert "missing_roles" in admin_err
        assert "encounter:sign" in admin_err["missing_roles"]
        assert "condition:write" in admin_err["missing_roles"]
        assert "medication:prescribe" in admin_err["missing_roles"]

        # 3. Login as Triage Nurse — Can save Triage, but blocked from Doctor Sign-off
        nurse_login = await client.post(
            "/api/v1/auth/login", data={"username": "nurse.suda", "password": "nurse12345"}
        )
        nurse_token = nurse_login.json()["access_token"]
        nurse_headers = {"Authorization": f"Bearer {nurse_token}"}

        triage_res = await client.post(
            "/api/v1/modules/doctor-opd/triage",
            json={
                "encounter_number": encounter_number,
                "patient_id": patient_id,
                "chief_complaint": "คัดกรองโดยพยาบาล: ไข้สูง 38.4 C เจ็บคอ",
                "vital_signs": consultation_payload["vital_signs"],
                "priority": "urgent",
            },
            headers=nurse_headers,
        )
        assert triage_res.status_code == 200

        nurse_sign_attempt = await client.post(
            "/api/v1/modules/doctor-opd/encounters",
            json=consultation_payload,
            headers=nurse_headers,
        )
        assert nurse_sign_attempt.status_code == 403
        nurse_err = nurse_sign_attempt.json()["detail"]
        assert nurse_err["missing_roles"] == [
            "encounter:sign",
            "condition:write",
            "medication:prescribe",
        ]

        # 4. Login as Licensed Doctor — Succeeds (201)
        doc_login = await client.post(
            "/api/v1/auth/login", data={"username": "dr.thanakorn", "password": "doctor12345"}
        )
        doc_token = doc_login.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}

        save_res = await client.post(
            "/api/v1/modules/doctor-opd/encounters",
            json=consultation_payload,
            headers=doc_headers,
        )
        assert save_res.status_code == 201
        saved_enc = save_res.json()
        assert saved_enc["encounter_number"] == encounter_number
        assert saved_enc["status"] == "finished"
        assert len(saved_enc["conditions"]) == 2
        assert len(saved_enc["medications"]) == 2

        # 5. Verify HL7 FHIR R4 Encounter $everything Bundle
        bundle_res = await client.get(f"/fhir/r4/Encounter/{encounter_number}/$everything")
        assert bundle_res.status_code == 200
        bundle = bundle_res.json()
        assert bundle["resourceType"] == "Bundle"
        assert bundle["total"] == 6

        # 6. Verify Pharmacy Dispense Role-List Guard:
        # Doctor lacks 'medication:dispense' -> 403 with missing_roles: ['medication:dispense']
        doc_dispense_attempt = await client.post(
            f"/api/v1/modules/doctor-opd/encounters/{encounter_number}/dispense",
            headers=doc_headers,
        )
        assert doc_dispense_attempt.status_code == 403
        assert doc_dispense_attempt.json()["detail"]["missing_roles"] == ["medication:dispense"]

        # Pharmacist has ['patient:read', 'medication:read', 'medication:dispense'] -> 200 OK
        pharm_login = await client.post(
            "/api/v1/auth/login", data={"username": "pharm.wichai", "password": "pharm12345"}
        )
        pharm_token = pharm_login.json()["access_token"]
        pharm_headers = {"Authorization": f"Bearer {pharm_token}"}

        dispense_res = await client.post(
            f"/api/v1/modules/doctor-opd/encounters/{encounter_number}/dispense",
            headers=pharm_headers,
        )
        assert dispense_res.status_code == 200
        dispensed_enc = dispense_res.json()
        assert all(m["status"] == "completed" for m in dispensed_enc["medications"])


@pytest.mark.asyncio
async def test_grouped_permissions_and_master_data_csv_import():
    """
    Test:
    1. Grouped permissions catalog (/api/v1/auth/permissions/grouped).
    2. Assigning multiple Role Groups + Direct Individual Permissions to a single user.
    3. Bulk CSV import of ICD-10 codes, Medications, and MPI Patients.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_login = await client.post(
            "/api/v1/auth/login", data={"username": "admin", "password": "admin12345"}
        )
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 1. Grouped permissions
        grp_res = await client.get("/api/v1/auth/permissions/grouped")
        assert grp_res.status_code == 200
        groups = grp_res.json()
        assert len(groups) >= 6

        # 2. Multi-role & direct individual permission assignment on Pharmacist user
        users_res = await client.get("/api/v1/auth/users", headers=admin_headers)
        assert users_res.status_code == 200
        pharm_user = next(u for u in users_res.json() if u["username"] == "pharm.wichai")

        update_perm_res = await client.put(
            f"/api/v1/auth/users/{pharm_user['id']}/permissions",
            json={
                "role_names": ["Pharmacist", "Auditor"],
                "direct_permission_names": ["masterdata:icd10"],
            },
            headers=admin_headers,
        )
        assert update_perm_res.status_code == 200
        updated_pharm = update_perm_res.json()
        assert "medication:dispense" in updated_pharm["permissions"]
        assert "audit:read" in updated_pharm["permissions"]
        assert "masterdata:icd10" in updated_pharm["permissions"]

        # 3. Bulk CSV Import for ICD-10
        icd_import = await client.post(
            "/api/v1/master-data/icd10/import",
            json={
                "csv_text": "code,display_en,display_th,category\nJ01.9,Acute sinusitis,ไซนัสอักเสบเฉียบพลัน,Respiratory"
            },
            headers=admin_headers,
        )
        assert icd_import.status_code == 200
        assert icd_import.json()["total_processed"] == 1

        # Verify imported ICD-10 is searchable in Doctor OPD
        search_j01 = await client.get("/api/v1/modules/doctor-opd/icd10/search?q=J01.9")
        assert any(i["code"] == "J01.9" for i in search_j01.json())

        # 4. Bulk CSV Import for Medications
        med_import = await client.post(
            "/api/v1/master-data/medications/import",
            json={
                "csv_text": "code,generic_name,trade_name,strength,dosage_form,default_dosage,unit,drug_allergy_class\nRX-LORA-10,Loratadine,Clarityne,10 mg,tablet,1 tab od,tablet,"
            },
            headers=admin_headers,
        )
        assert med_import.status_code == 200
        assert med_import.json()["total_processed"] == 1

        # 5. Bulk CSV Import for MPI Patients
        pat_import = await client.post(
            "/api/v1/master-data/patients/import",
            json={
                "csv_text": "hn,citizen_id,prefix,first_name,last_name,gender,birth_date,blood_group,allergies\nHN-2026-0099,1100500998877,นาง,พรทิพย์,เจริญสุข,female,1975-03-19,A+,Penicillin|Ibuprofen"
            },
            headers=admin_headers,
        )
        assert pat_import.status_code == 200
        assert pat_import.json()["total_processed"] == 1


@pytest.mark.asyncio
async def test_phase5_reception_checkin_and_nursing_triage_workflow():
    """
    Phase 5 (ORG-6) Verification:
    1. Pharmacist lacking 'queue:manage' gets 403 with missing_roles=['queue:manage'] on POST /checkin.
    2. Receptionist ('reg.somporn') with ['patient:read', 'queue:manage'] checks in a patient (201) -> status='arrived'.
    3. Receptionist lacking 'triage:write' gets 403 with missing_roles=['triage:write'] on POST /triage.
    4. Triage Nurse ('nurse.suda') records Vital Signs + Allergies -> auto-calculates BMI and transitions status to 'triaged'.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        q_res = await client.get("/api/v1/modules/doctor-opd/queue")
        assert q_res.status_code == 200
        patient_id = q_res.json()[0]["patient_id"]

        # 1. Pharmacist tries to check in patient -> 403 missing_roles: ['queue:manage']
        pharm_login = await client.post(
            "/api/v1/auth/login", data={"username": "pharm.wichai", "password": "pharm12345"}
        )
        pharm_headers = {"Authorization": f"Bearer {pharm_login.json()['access_token']}"}

        pharm_checkin = await client.post(
            "/api/v1/modules/doctor-opd/checkin",
            json={
                "patient_id": patient_id,
                "department": "อายุรกรรมทั่วไป (OPD Med Rm.3)",
                "priority": "urgent",
                "chief_complaint": "แน่นหน้าอก หายใจเหนื่อย",
            },
            headers=pharm_headers,
        )
        assert pharm_checkin.status_code == 403
        assert pharm_checkin.json()["detail"]["missing_roles"] == ["queue:manage"]

        # 2. Receptionist checks in patient -> 201 Created
        reg_login = await client.post(
            "/api/v1/auth/login", data={"username": "reg.somporn", "password": "reg12345"}
        )
        reg_headers = {"Authorization": f"Bearer {reg_login.json()['access_token']}"}

        checkin_res = await client.post(
            "/api/v1/modules/doctor-opd/checkin",
            json={
                "patient_id": patient_id,
                "department": "อายุรกรรมทั่วไป (OPD Med Rm.3)",
                "priority": "urgent",
                "chief_complaint": "มาตรวจอาการแน่นหน้าอกและเวียนศีรษะ",
            },
            headers=reg_headers,
        )
        assert checkin_res.status_code == 201
        new_queue = checkin_res.json()
        assert new_queue["status"] == "arrived"
        assert new_queue["queue_number"].startswith("U-")
        new_enc_num = new_queue["encounter_number"]

        # 3. Receptionist tries to save Nursing Triage -> 403 missing_roles: ['triage:write']
        reg_triage_attempt = await client.post(
            "/api/v1/modules/doctor-opd/triage",
            json={
                "encounter_number": new_enc_num,
                "patient_id": patient_id,
                "chief_complaint": "เวชระเบียนพยายามบันทึกสัญญาณชีพ",
                "vital_signs": {"weight": 72.0, "height": 170.0},
            },
            headers=reg_headers,
        )
        assert reg_triage_attempt.status_code == 403
        assert reg_triage_attempt.json()["detail"]["missing_roles"] == ["triage:write"]

        # 4. Triage Nurse records Vital Signs & Allergies -> 200 OK, auto-BMI = 24.9, status = 'triaged'
        nurse_login = await client.post(
            "/api/v1/auth/login", data={"username": "nurse.suda", "password": "nurse12345"}
        )
        nurse_headers = {"Authorization": f"Bearer {nurse_login.json()['access_token']}"}

        triage_ok = await client.post(
            "/api/v1/modules/doctor-opd/triage",
            json={
                "encounter_number": new_enc_num,
                "patient_id": patient_id,
                "chief_complaint": "พยาบาลคัดกรอง: เวียนศีรษะ ความดันสูงเล็กน้อย",
                "priority": "urgent",
                "allergies": ["Penicillin (ผื่นลมพิษเฉียบพลัน)", "Aspirin (หลอดลมตีบ)"],
                "vital_signs": {
                    "bp_systolic": 144,
                    "bp_diastolic": 92,
                    "pulse": 88,
                    "temperature": 37.1,
                    "respiratory_rate": 20,
                    "spo2": 98,
                    "weight": 72.0,
                    "height": 170.0,
                    "pain_score": 3,
                },
            },
            headers=nurse_headers,
        )
        assert triage_ok.status_code == 200
        triaged_enc = triage_ok.json()
        assert triaged_enc["status"] == "triaged"
        assert triaged_enc["vital_signs"]["bmi"] == 24.9
        assert triaged_enc["vital_signs"]["pain_score"] == 3


@pytest.mark.asyncio
async def test_phase6_laboratory_lis_orders_results_and_fhir_observation():
    """
    Phase 6 (ORG-7) Verification:
    1. LOINC Master Lab Catalog search & Bulk CSV import ('masterdata:labs').
    2. Triage Nurse lacking 'lab:order' gets 403 with missing_roles=['lab:order'] when ordering a lab test.
    3. Doctor ('dr.thanakorn') orders LAB-FBS (LOINC 1558-6) -> 201 Created.
    4. Doctor lacking 'lab:result_write' gets 403 with missing_roles=['lab:result_write'] when reporting result.
    5. Medical Technologist ('lab.somkid', ทน.14209) reports result '136' mg/dL -> auto-classified 'high' (ref 70-99).
    6. HL7 FHIR R4 /fhir/r4/Encounter/{enc}/$everything includes the LOINC Observation resource.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.get("/api/v1/modules/doctor-opd/queue")

        # 1. Search LOINC Lab Catalog
        cat_res = await client.get("/api/v1/modules/doctor-opd/labs/catalog?q=FBS")
        assert cat_res.status_code == 200
        assert any(item["loinc_code"] == "1558-6" for item in cat_res.json())

        # Bulk CSV import of a new LOINC Lab Test by Medical Technologist ('lab.somkid')
        lab_login = await client.post(
            "/api/v1/auth/login", data={"username": "lab.somkid", "password": "lab12345"}
        )
        assert lab_login.status_code == 200
        lab_headers = {"Authorization": f"Bearer {lab_login.json()['access_token']}"}

        import_lab_res = await client.post(
            "/api/v1/master-data/labs/import",
            json={
                "csv_text": "code,loinc_code,test_name,category,specimen_type,unit,reference_range,ref_low,ref_high\nLAB-TSH,3016-3,Thyroid Stimulating Hormone (TSH),Endocrinology,Serum,mIU/L,0.4 - 4.0 mIU/L,0.4,4.0"
            },
            headers=lab_headers,
        )
        assert import_lab_res.status_code == 200
        assert import_lab_res.json()["total_processed"] == 1

        # 2. Nurse tries to order a Lab Test -> 403 missing_roles: ['lab:order']
        nurse_login = await client.post(
            "/api/v1/auth/login", data={"username": "nurse.suda", "password": "nurse12345"}
        )
        nurse_headers = {"Authorization": f"Bearer {nurse_login.json()['access_token']}"}

        nurse_order_attempt = await client.post(
            "/api/v1/modules/doctor-opd/encounters/ENC-2026-002/labs",
            json={
                "lab_code": "LAB-FBS",
                "test_name": "Fasting Blood Glucose",
                "priority": "routine",
            },
            headers=nurse_headers,
        )
        assert nurse_order_attempt.status_code == 403
        assert nurse_order_attempt.json()["detail"]["missing_roles"] == ["lab:order"]

        # 3. Doctor orders LAB-FBS on ENC-2026-002 -> 201 Created
        doc_login = await client.post(
            "/api/v1/auth/login", data={"username": "dr.thanakorn", "password": "doctor12345"}
        )
        doc_headers = {"Authorization": f"Bearer {doc_login.json()['access_token']}"}

        order_res = await client.post(
            "/api/v1/modules/doctor-opd/encounters/ENC-2026-002/labs",
            json={
                "lab_code": "LAB-FBS",
                "test_name": "Fasting Blood Glucose",
                "priority": "urgent",
                "clinical_note": "คัดกรองเบาหวาน",
            },
            headers=doc_headers,
        )
        assert order_res.status_code == 201
        created_lab = order_res.json()
        assert created_lab["loinc_code"] == "1558-6"
        assert created_lab["status"] == "ordered"
        lab_order_id = created_lab["id"]

        # 4. Doctor tries to report Lab Result -> 403 missing_roles: ['lab:result_write']
        doc_report_attempt = await client.post(
            f"/api/v1/modules/doctor-opd/labs/{lab_order_id}/result",
            json={"result_value": "136"},
            headers=doc_headers,
        )
        assert doc_report_attempt.status_code == 403
        assert doc_report_attempt.json()["detail"]["missing_roles"] == ["lab:result_write"]

        # 5. Medical Technologist ('lab.somkid') reports result '136' mg/dL -> 200 OK, abnormal_flag='high'
        report_res = await client.post(
            f"/api/v1/modules/doctor-opd/labs/{lab_order_id}/result",
            json={
                "result_value": "136",
                "clinical_note": "ตรวจซ้ำด้วยเครื่อง Cobas ยืนยันค่าสูงกว่าเกณฑ์",
            },
            headers=lab_headers,
        )
        assert report_res.status_code == 200
        reported_lab = report_res.json()
        assert reported_lab["status"] == "completed"
        assert reported_lab["abnormal_flag"] == "high"
        assert reported_lab["reported_by_license"] == "ทน.14209"

        # 6. Verify HL7 FHIR R4 $everything Bundle on ENC-2026-002 contains the LOINC Observation
        fhir_res = await client.get("/fhir/r4/Encounter/ENC-2026-002/$everything")
        assert fhir_res.status_code == 200
        bundle = fhir_res.json()
        obs_entries = [
            e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Observation"
        ]
        assert len(obs_entries) >= 1
        fbs_obs = next(o for o in obs_entries if o["code"]["coding"][0]["code"] == "1558-6")
        assert fbs_obs["valueQuantity"]["value"] == 136.0
        assert fbs_obs["interpretation"][0]["coding"][0]["code"] == "H"
