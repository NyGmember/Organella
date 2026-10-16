import uuid
from datetime import date, datetime, timezone
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from organella_core.config import settings
from organella_core.database import get_db
from organella_core.models.auth import Role, User
from organella_core.models.clinical import Condition, Encounter, MedicationOrder
from organella_core.models.patient import Patient
from organella_core.schemas.clinical import (
    ConditionResponse,
    EncounterConsultationCreate,
    EncounterResponse,
    ICD10CodeItem,
    MedicationOrderResponse,
    QueueItemResponse,
)
from organella_core.services.audit import log_audit_event
from organella_core.services.event_bus import publish_event

router = APIRouter(
    prefix="/modules/doctor-opd",
    tags=["Module: Doctor OPD Consultation (@organella-module/doctor-opd)"],
)

optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# Standard ICD-10-TM / WHO Reference Dictionary for Common OPD Visits
COMMON_ICD10_CATALOG: List[ICD10CodeItem] = [
    ICD10CodeItem(
        code="J00",
        display="Acute nasopharyngitis [common cold] (โรคหวัดเฉียบพลัน)",
        category="Respiratory",
    ),
    ICD10CodeItem(
        code="J02.9",
        display="Acute pharyngitis, unspecified (คออักเสบเฉียบพลัน)",
        category="Respiratory",
    ),
    ICD10CodeItem(
        code="J06.9",
        display="Acute upper respiratory infection, unspecified (ติดเชื้อทางเดินหายใจส่วนบนเฉียบพลัน)",
        category="Respiratory",
    ),
    ICD10CodeItem(
        code="I10",
        display="Essential (primary) hypertension (ความดันโลหิตสูงชนิดไม่ทราบสาเหตุ)",
        category="Cardiovascular",
    ),
    ICD10CodeItem(
        code="E11.9",
        display="Type 2 diabetes mellitus without complications (เบาหวานชนิดที่ 2 ไม่มีภาวะแทรกซ้อน)",
        category="Endocrine & Metabolic",
    ),
    ICD10CodeItem(
        code="E78.5",
        display="Hyperlipidaemia, unspecified (ไขมันในเลือดสูง)",
        category="Endocrine & Metabolic",
    ),
    ICD10CodeItem(
        code="K21.9",
        display="Gastro-oesophageal reflux disease without oesophagitis (กรดไหลย้อน GERD)",
        category="Gastrointestinal",
    ),
    ICD10CodeItem(
        code="K29.7",
        display="Gastritis, unspecified (กระเพาะอาหารอักเสบ)",
        category="Gastrointestinal",
    ),
    ICD10CodeItem(
        code="A09",
        display="Infectious gastroenteritis and colitis, unspecified (ลำไส้อักเสบติดเชื้อ/ท้องร่วง)",
        category="Gastrointestinal",
    ),
    ICD10CodeItem(
        code="M54.5",
        display="Low back pain (ปวดหลังส่วนล่าง)",
        category="Musculoskeletal",
    ),
    ICD10CodeItem(
        code="M79.1",
        display="Myalgia (ปวดกล้ามเนื้อ)",
        category="Musculoskeletal",
    ),
    ICD10CodeItem(
        code="G43.9",
        display="Migraine, unspecified (ปวดศีรษะไมเกรน)",
        category="Neurological",
    ),
    ICD10CodeItem(
        code="R50.9",
        display="Fever, unspecified (ไข้ไม่ทราบสาเหตุ)",
        category="Symptoms & Signs",
    ),
    ICD10CodeItem(
        code="R51",
        display="Headache (อาการปวดศีรษะ)",
        category="Symptoms & Signs",
    ),
    ICD10CodeItem(
        code="L20.9",
        display="Atopic dermatitis, unspecified (ผื่นภูมิแพ้ผิวหนัง)",
        category="Dermatology",
    ),
]


async def get_optional_user(
    token: Annotated[Optional[str], Depends(optional_oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        user_id_str: Optional[str] = payload.get("sub")
        if not user_id_str:
            return None
        user_id = uuid.UUID(user_id_str)
        stmt = (
            select(User)
            .options(selectinload(User.roles).selectinload(Role.permissions))
            .where(User.id == user_id, User.is_active.is_(True))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    except (JWTError, ValueError):
        return None


async def ensure_sample_opd_queue(db: AsyncSession) -> None:
    """Ensures sample patients and OPD encounters exist so the OPD queue is populated out-of-the-box."""
    count_stmt = select(Encounter).limit(1)
    existing = (await db.execute(count_stmt)).scalar_one_or_none()
    if existing is not None:
        return

    # Find or create doctor user
    doc_res = await db.execute(select(User).where(User.username == "dr.thanakorn"))
    doctor = doc_res.scalar_one_or_none()
    practitioner_id = doctor.id if doctor else None

    # Sample Patients
    sample_patients_data = [
        {
            "hn": "HN-2026-0001",
            "citizen_id": "1100400239481",
            "prefix": "นาย",
            "first_name": "สมชาย",
            "last_name": "ใจดี",
            "gender": "male",
            "birth_date": date(1978, 5, 14),
            "blood_group": "O+",
            "allergies": ["Penicillin (ผื่นลมพิษเฉียบพลัน)", "Aspirin (หลอดลมตีบ)"],
            "contact_info": {"phone": "081-234-5678"},
            "address": {"province": "กรุงเทพมหานคร"},
            "encounter": {
                "encounter_number": "ENC-2026-001",
                "queue_number": "A-014",
                "status": "in-progress",
                "priority": "urgent",
                "department": "อายุรกรรมทั่วไป (OPD Med Rm.3)",
                "chief_complaint": "ไข้สูง เจ็บคอมาก กลืนลำบาก 2 วันก่อนมาโรงพยาบาล",
                "vital_signs": {
                    "bp_systolic": 134,
                    "bp_diastolic": 84,
                    "pulse": 92,
                    "temperature": 38.4,
                    "respiratory_rate": 20,
                    "spo2": 98,
                    "weight": 68.5,
                    "height": 172.0,
                },
                "soap_note": {
                    "subjective": "ผู้ป่วยชายไทยคู่ อายุ 48 ปี มาด้วยอาการไข้สูง หนาวสั่น เจ็บคอมากเวลากลืนน้ำลาย ไอแห้งๆ มีน้ำมูกใส 2 วัน ปฏิเสธประวัติเดินทางต่างประเทศ",
                    "objective": "GA: Alert, mild toxic appearance. HEENT: Markedly injected pharynx, tonsillar hypertrophy 2+ without exudate. Lungs: Clear, equal breath sounds.",
                    "assessment": "Acute pharyngitis (คออักเสบเฉียบพลัน) — ระวังประวัติแพ้ยา Penicillin และ Aspirin",
                    "plan": "1. ให้ยาลดไข้ Paracetamol 500 mg (หลีกเลี่ยง NSAIDs/Aspirin)\n2. Roxithromycin 150 mg (ทดแทนกลุ่ม Penicillin)\n3. ดื่มน้ำอุ่นมากๆ พักผ่อน นัดติดตามอาการหากไข้ไม่ลงใน 3 วัน",
                },
                "conditions": [
                    {
                        "icd10_code": "J02.9",
                        "icd10_display": "Acute pharyngitis, unspecified (คออักเสบเฉียบพลัน)",
                        "diagnosis_type": "principal",
                    },
                    {
                        "icd10_code": "I10",
                        "icd10_display": "Essential (primary) hypertension (ความดันโลหิตสูงชนิดไม่ทราบสาเหตุ)",
                        "diagnosis_type": "comorbidity",
                    },
                ],
                "medications": [
                    {
                        "medication_code": "RX-PARA-500",
                        "medication_name": "Paracetamol 500 mg Tablet",
                        "dosage_instruction": "รับประทานครั้งละ 1 เม็ด ทุก 4-6 ชั่วโมง เวลาปวดหรือมีไข้",
                        "quantity": 20,
                        "unit": "tablet",
                    },
                    {
                        "medication_code": "RX-ROXI-150",
                        "medication_name": "Roxithromycin 150 mg Tablet (Safe for Penicillin Allergy)",
                        "dosage_instruction": "รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น",
                        "quantity": 14,
                        "unit": "tablet",
                    },
                ],
            },
        },
        {
            "hn": "HN-2026-0002",
            "citizen_id": "3100900451234",
            "prefix": "นางสาว",
            "first_name": "วิภาวี",
            "last_name": "สุขสวัสดิ์",
            "gender": "female",
            "birth_date": date(1989, 11, 22),
            "blood_group": "B+",
            "allergies": [],
            "contact_info": {"phone": "089-876-5432"},
            "address": {"province": "นนทบุรี"},
            "encounter": {
                "encounter_number": "ENC-2026-002",
                "queue_number": "A-015",
                "status": "arrived",
                "priority": "routine",
                "department": "อายุรกรรมทั่วไป (OPD Med Rm.3)",
                "chief_complaint": "จุกแสบลิ้นปี่ เรอเปรี้ยว หลังอาหารมื้อเย็น เป็นมา 1 สัปดาห์",
                "vital_signs": {
                    "bp_systolic": 116,
                    "bp_diastolic": 74,
                    "pulse": 76,
                    "temperature": 36.6,
                    "respiratory_rate": 16,
                    "spo2": 99,
                    "weight": 54.0,
                    "height": 161.0,
                },
                "soap_note": {
                    "subjective": "ผู้ป่วยหญิง อายุ 36 ปี มีอาการจุกแสบยอดอกและลิ้นปี่ เรอเปรี้ยว โดยเฉพาะเวลาเอนตัวนอนหลังรับประทานอาหารเย็น",
                    "objective": "Abdomen: Soft, mild tenderness at epigastrium, no guarding, normal bowel sounds.",
                    "assessment": "Gastro-oesophageal reflux disease without oesophagitis (GERD)",
                    "plan": "1. Omeprazole 20 mg ก่อนอาหารเช้า-เย็น\n2. แนะนำงดอาหารรสจัด กาแฟ และไม่ควรเอนนอนทันทีหลังอาหารอย่างน้อย 3 ชั่วโมง",
                },
                "conditions": [
                    {
                        "icd10_code": "K21.9",
                        "icd10_display": "Gastro-oesophageal reflux disease without oesophagitis (กรดไหลย้อน GERD)",
                        "diagnosis_type": "principal",
                    }
                ],
                "medications": [
                    {
                        "medication_code": "RX-OMEP-20",
                        "medication_name": "Omeprazole 20 mg Capsule",
                        "dosage_instruction": "รับประทานครั้งละ 1 แคปซูล วันละ 2 ครั้ง ก่อนอาหารเช้า-เย็น 30 นาที",
                        "quantity": 28,
                        "unit": "capsule",
                    }
                ],
            },
        },
        {
            "hn": "HN-2026-0003",
            "citizen_id": "1509900112233",
            "prefix": "นาย",
            "first_name": "กิตติพงศ์",
            "last_name": "เจริญรุ่งเรือง",
            "gender": "male",
            "birth_date": date(1964, 2, 8),
            "blood_group": "A+",
            "allergies": ["Sulfa (ผื่นแดงคันตามตัว)"],
            "contact_info": {"phone": "086-111-9988"},
            "address": {"province": "ปทุมธานี"},
            "encounter": {
                "encounter_number": "ENC-2026-003",
                "queue_number": "A-016",
                "status": "triaged",
                "priority": "routine",
                "department": "คลินิกโรคเรื้อรัง NCD (OPD Med Rm.3)",
                "chief_complaint": "ตรวจติดตามอาการเบาหวานและความดันโลหิตสูงตามนัด รับยาต่อเนื่อง",
                "vital_signs": {
                    "bp_systolic": 138,
                    "bp_diastolic": 82,
                    "pulse": 72,
                    "temperature": 36.5,
                    "respiratory_rate": 18,
                    "spo2": 98,
                    "weight": 74.2,
                    "height": 168.0,
                },
                "soap_note": {
                    "subjective": "ผู้ป่วยมาตามนัดคลินิกเบาหวานและความดัน ทานยาสม่ำเสมอ ไม่มีอาการหน้ามืดหรือน้ำตาลต่ำ",
                    "objective": "GA: Good consciousness. Heart: Regular rhythm, no murmur. Extremities: Foot exam normal sensation, dorsalis pedis 2+ bilaterally. FBS = 124 mg/dL, HbA1c = 6.8%.",
                    "assessment": "Well-controlled Type 2 DM and Essential Hypertension",
                    "plan": "1. Continue Metformin 500 mg & Amlodipine 5 mg\n2. นัดติดตามอาการพร้อมตรวจเลือดซ้ำอีก 3 เดือน",
                },
                "conditions": [
                    {
                        "icd10_code": "E11.9",
                        "icd10_display": "Type 2 diabetes mellitus without complications (เบาหวานชนิดที่ 2 ไม่มีภาวะแทรกซ้อน)",
                        "diagnosis_type": "principal",
                    },
                    {
                        "icd10_code": "I10",
                        "icd10_display": "Essential (primary) hypertension (ความดันโลหิตสูงชนิดไม่ทราบสาเหตุ)",
                        "diagnosis_type": "comorbidity",
                    },
                ],
                "medications": [
                    {
                        "medication_code": "RX-METF-500",
                        "medication_name": "Metformin 500 mg Tablet",
                        "dosage_instruction": "รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหารเช้า-เย็น",
                        "quantity": 180,
                        "unit": "tablet",
                    },
                    {
                        "medication_code": "RX-AMLO-5",
                        "medication_name": "Amlodipine 5 mg Tablet",
                        "dosage_instruction": "รับประทานครั้งละ 1 เม็ด วันละ 1 ครั้ง หลังอาหารเช้า",
                        "quantity": 90,
                        "unit": "tablet",
                    },
                ],
            },
        },
    ]

    for item in sample_patients_data:
        pat_res = await db.execute(select(Patient).where(Patient.hn == item["hn"]))
        patient = pat_res.scalar_one_or_none()
        if not patient:
            patient = Patient(
                hn=item["hn"],
                citizen_id=item["citizen_id"],
                prefix=item["prefix"],
                first_name=item["first_name"],
                last_name=item["last_name"],
                gender=item["gender"],
                birth_date=item["birth_date"],
                blood_group=item["blood_group"],
                allergies=item["allergies"],
                contact_info=item["contact_info"],
                address=item["address"],
            )
            db.add(patient)
            await db.flush()

        enc_data = item["encounter"]
        enc_res = await db.execute(
            select(Encounter).where(Encounter.encounter_number == enc_data["encounter_number"])
        )
        if not enc_res.scalar_one_or_none():
            encounter = Encounter(
                encounter_number=enc_data["encounter_number"],
                patient_id=patient.id,
                practitioner_id=practitioner_id,
                encounter_type="OPD",
                status=enc_data["status"],
                priority=enc_data["priority"],
                department=enc_data["department"],
                queue_number=enc_data["queue_number"],
                chief_complaint=enc_data["chief_complaint"],
                vital_signs=enc_data["vital_signs"],
                soap_note=enc_data["soap_note"],
            )
            db.add(encounter)
            await db.flush()

            for cond in enc_data["conditions"]:
                db.add(
                    Condition(
                        encounter_id=encounter.id,
                        patient_id=patient.id,
                        icd10_code=cond["icd10_code"],
                        icd10_display=cond["icd10_display"],
                        diagnosis_type=cond["diagnosis_type"],
                        clinical_status="active",
                        verification_status="confirmed",
                    )
                )

            for med in enc_data["medications"]:
                db.add(
                    MedicationOrder(
                        encounter_id=encounter.id,
                        patient_id=patient.id,
                        medication_code=med["medication_code"],
                        medication_name=med["medication_name"],
                        dosage_instruction=med["dosage_instruction"],
                        quantity=med["quantity"],
                        unit=med["unit"],
                        status="active",
                    )
                )

    await db.commit()


@router.get("/icd10/search", response_model=List[ICD10CodeItem])
async def search_icd10_codes(
    q: Optional[str] = Query(None, description="Search query by ICD-10 code or disease name"),
    limit: int = Query(15, ge=1, le=50),
):
    """Search standard ICD-10 terminology codes for clinical diagnosis"""
    if not q or not q.strip():
        return COMMON_ICD10_CATALOG[:limit]

    query_lower = q.strip().lower()
    matched = [
        item
        for item in COMMON_ICD10_CATALOG
        if query_lower in item.code.lower()
        or query_lower in item.display.lower()
        or query_lower in item.category.lower()
    ]
    return matched[:limit]


@router.get("/queue", response_model=List[QueueItemResponse])
async def get_opd_queue(
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Optional[str] = Query(None, alias="status"),
):
    """Retrieve the active Outpatient Department (OPD) consultation queue with patient demographics"""
    await ensure_sample_opd_queue(db)

    stmt = (
        select(Encounter, Patient)
        .join(Patient, Encounter.patient_id == Patient.id)
        .options(selectinload(Encounter.conditions), selectinload(Encounter.medications))
        .order_by(Encounter.queue_number.asc(), Encounter.started_at.asc())
    )
    if status_filter:
        stmt = stmt.where(Encounter.status == status_filter)

    result = await db.execute(stmt)
    rows = result.all()

    queue_items: List[QueueItemResponse] = []
    for enc, pat in rows:
        prefix_str = f"{pat.prefix} " if pat.prefix else ""
        full_name = f"{prefix_str}{pat.first_name} {pat.last_name}".strip()
        queue_items.append(
            QueueItemResponse(
                encounter_id=enc.id,
                encounter_number=enc.encounter_number,
                queue_number=enc.queue_number or "A-000",
                status=enc.status,
                priority=enc.priority,
                department=enc.department,
                chief_complaint=enc.chief_complaint,
                started_at=enc.started_at,
                patient_id=pat.id,
                hn=pat.hn,
                patient_name=full_name,
                gender=pat.gender,
                birth_date=pat.birth_date.isoformat(),
                blood_group=pat.blood_group,
                allergies=pat.allergies or [],
                vital_signs=enc.vital_signs or {},
                soap_note=enc.soap_note or {},
                conditions=[ConditionResponse.model_validate(c) for c in enc.conditions],
                medications=[MedicationOrderResponse.model_validate(m) for m in enc.medications],
            )
        )

    return queue_items


@router.get("/encounters/{encounter_id}", response_model=EncounterResponse)
async def get_opd_encounter(
    encounter_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Retrieve a specific OPD Encounter by UUID or Encounter Number"""
    stmt = select(Encounter).options(
        selectinload(Encounter.conditions), selectinload(Encounter.medications)
    )
    try:
        val_uuid = uuid.UUID(encounter_id)
        stmt = stmt.where(Encounter.id == val_uuid)
    except ValueError:
        stmt = stmt.where(Encounter.encounter_number == encounter_id)

    result = await db.execute(stmt)
    encounter = result.scalar_one_or_none()
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPD Encounter '{encounter_id}' not found",
        )
    return encounter


@router.post("/encounters", response_model=EncounterResponse, status_code=status.HTTP_201_CREATED)
async def save_opd_consultation(
    payload: EncounterConsultationCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Optional[User], Depends(get_optional_user)],
):
    """
    Create or update an OPD Consultation including Vital Signs, SOAP Notes,
    ICD-10 Conditions, and Medication Prescriptions in a single atomic transaction.
    """
    # Verify patient exists
    pat_res = await db.execute(select(Patient).where(Patient.id == payload.patient_id))
    patient = pat_res.scalar_one_or_none()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{payload.patient_id}' not found in MPI",
        )

    # Check if updating existing encounter
    encounter: Optional[Encounter] = None
    if payload.encounter_id:
        enc_res = await db.execute(
            select(Encounter)
            .options(selectinload(Encounter.conditions), selectinload(Encounter.medications))
            .where(Encounter.id == payload.encounter_id)
        )
        encounter = enc_res.scalar_one_or_none()
    elif payload.encounter_number:
        enc_res = await db.execute(
            select(Encounter)
            .options(selectinload(Encounter.conditions), selectinload(Encounter.medications))
            .where(Encounter.encounter_number == payload.encounter_number)
        )
        encounter = enc_res.scalar_one_or_none()

    now_utc = datetime.now(timezone.utc)

    if encounter:
        encounter.status = payload.status
        encounter.priority = payload.priority
        encounter.department = payload.department
        if payload.queue_number:
            encounter.queue_number = payload.queue_number
        if payload.chief_complaint is not None:
            encounter.chief_complaint = payload.chief_complaint
        encounter.vital_signs = payload.vital_signs.model_dump()
        encounter.soap_note = payload.soap_note.model_dump()
        if current_user:
            encounter.practitioner_id = current_user.id
        if payload.status == "finished" and not encounter.ended_at:
            encounter.ended_at = now_utc

        # Replace conditions and medications cleanly
        encounter.conditions.clear()
        encounter.medications.clear()
        await db.flush()
    else:
        enc_number = (
            payload.encounter_number
            or f"ENC-{now_utc.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        )
        encounter = Encounter(
            encounter_number=enc_number,
            patient_id=patient.id,
            practitioner_id=current_user.id if current_user else None,
            encounter_type=payload.encounter_type,
            status=payload.status,
            priority=payload.priority,
            department=payload.department,
            queue_number=payload.queue_number or "A-099",
            chief_complaint=payload.chief_complaint,
            vital_signs=payload.vital_signs.model_dump(),
            soap_note=payload.soap_note.model_dump(),
            ended_at=now_utc if payload.status == "finished" else None,
        )
        db.add(encounter)
        await db.flush()

    # Add ICD-10 Diagnoses
    for cond_in in payload.conditions:
        encounter.conditions.append(
            Condition(
                encounter_id=encounter.id,
                patient_id=patient.id,
                icd10_code=cond_in.icd10_code,
                icd10_display=cond_in.icd10_display,
                clinical_status=cond_in.clinical_status,
                verification_status=cond_in.verification_status,
                diagnosis_type=cond_in.diagnosis_type,
                notes=cond_in.notes,
            )
        )

    # Add Medication Orders
    for med_in in payload.medications:
        encounter.medications.append(
            MedicationOrder(
                encounter_id=encounter.id,
                patient_id=patient.id,
                medication_code=med_in.medication_code,
                medication_name=med_in.medication_name,
                dosage_instruction=med_in.dosage_instruction,
                quantity=med_in.quantity,
                unit=med_in.unit,
                status=med_in.status,
                notes=med_in.notes,
            )
        )

    await db.commit()

    # Reload with relationships
    reload_stmt = (
        select(Encounter)
        .options(selectinload(Encounter.conditions), selectinload(Encounter.medications))
        .where(Encounter.id == encounter.id)
    )
    encounter = (await db.execute(reload_stmt)).scalar_one()

    # Audit Log for PDPA / HIPAA Compliance
    await log_audit_event(
        db=db,
        action="SAVE_OPD_CONSULTATION",
        resource_type="Encounter",
        resource_id=str(encounter.id),
        user_id=current_user.id if current_user else None,
        user_name=current_user.username if current_user else "dr.thanakorn (session)",
        user_role=current_user.roles[0].name if (current_user and current_user.roles) else "Doctor",
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        module_id="@organella-module/doctor-opd",
        details={
            "encounter_number": encounter.encounter_number,
            "patient_hn": patient.hn,
            "status": encounter.status,
            "icd10_codes": [c.icd10_code for c in encounter.conditions],
            "medication_count": len(encounter.medications),
        },
    )

    # Publish Domain Events to Redis Event Bus
    await publish_event(
        channel="organella:clinical_events",
        event_name="on_encounter_saved",
        payload={
            "encounter_id": str(encounter.id),
            "encounter_number": encounter.encounter_number,
            "patient_id": str(patient.id),
            "hn": patient.hn,
            "status": encounter.status,
            "diagnoses": [c.icd10_code for c in encounter.conditions],
        },
    )
    if encounter.medications:
        await publish_event(
            channel="organella:clinical_events",
            event_name="on_prescription_ordered",
            payload={
                "encounter_id": str(encounter.id),
                "patient_id": str(patient.id),
                "hn": patient.hn,
                "medications": [
                    {
                        "name": m.medication_name,
                        "dosage": m.dosage_instruction,
                        "quantity": m.quantity,
                        "unit": m.unit,
                    }
                    for m in encounter.medications
                ],
            },
        )

    return encounter
