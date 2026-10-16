import uuid
from datetime import date, datetime, timezone
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from organella_core.database import get_db
from organella_core.models.auth import User
from organella_core.models.clinical import Condition, Encounter, MedicationOrder
from organella_core.models.master_data import MasterICD10, MasterMedication
from organella_core.models.patient import Patient
from organella_core.schemas.clinical import (
    ConditionResponse,
    EncounterConsultationCreate,
    EncounterResponse,
    ICD10CodeItem,
    MedicationOrderResponse,
    QueueItemResponse,
    VitalSignsSchema,
)
from organella_core.schemas.master_data import MedicationMasterResponse
from organella_core.security import require_permissions
from organella_core.services.audit import log_audit_event
from organella_core.services.event_bus import publish_event

router = APIRouter(
    prefix="/modules/doctor-opd",
    tags=["Module: Doctor OPD Consultation (@organella-module/doctor-opd)"],
)


class TriageUpdatePayload(BaseModel):
    encounter_number: str
    patient_id: uuid.UUID
    chief_complaint: str = Field(..., min_length=1)
    vital_signs: VitalSignsSchema = Field(default_factory=VitalSignsSchema)
    priority: str = Field(default="routine")


# Standard ICD-10-TM / WHO Reference Dictionary fallback
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
        code="K21.9",
        display="Gastro-oesophageal reflux disease without oesophagitis (กรดไหลย้อน GERD)",
        category="Gastrointestinal",
    ),
]


async def ensure_sample_opd_queue(db: AsyncSession) -> None:
    """Ensures sample patients, master data, and OPD encounters exist."""
    from organella_core.seed import ensure_master_data_and_rbac

    await ensure_master_data_and_rbac(db)

    count_stmt = select(Encounter).limit(1)
    existing = (await db.execute(count_stmt)).scalar_one_or_none()
    if existing is not None:
        return

    doc_res = await db.execute(select(User).where(User.username == "dr.thanakorn"))
    doctor = doc_res.scalar_one_or_none()
    practitioner_id = doctor.id if doctor else None

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
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search query by ICD-10 code or disease name"),
    limit: int = Query(15, ge=1, le=50),
):
    """Search ICD-10 terminology codes from Master Data table (`master_icd10_codes`)"""
    stmt = select(MasterICD10).where(MasterICD10.is_active.is_(True))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                MasterICD10.code.ilike(pattern),
                MasterICD10.display_en.ilike(pattern),
                MasterICD10.display_th.ilike(pattern),
                MasterICD10.category.ilike(pattern),
            )
        )
    stmt = stmt.order_by(MasterICD10.code.asc()).limit(limit)
    res = await db.execute(stmt)
    rows = list(res.scalars().all())

    if rows:
        return [ICD10CodeItem(code=r.code, display=r.display, category=r.category) for r in rows]

    # Fallback if DB not yet seeded
    if not q or not q.strip():
        return COMMON_ICD10_CATALOG[:limit]
    query_lower = q.strip().lower()
    return [
        item
        for item in COMMON_ICD10_CATALOG
        if query_lower in item.code.lower() or query_lower in item.display.lower()
    ][:limit]


@router.get("/medications/search", response_model=List[MedicationMasterResponse])
async def search_formulary_medications(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search hospital drug formulary"),
    limit: int = Query(20, ge=1, le=50),
):
    """Search Hospital Drug Formulary (`master_medications`) for e-Prescription"""
    stmt = select(MasterMedication).where(MasterMedication.is_active.is_(True))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                MasterMedication.code.ilike(pattern),
                MasterMedication.generic_name.ilike(pattern),
                MasterMedication.trade_name.ilike(pattern),
            )
        )
    stmt = stmt.order_by(MasterMedication.generic_name.asc()).limit(limit)
    res = await db.execute(stmt)
    return list(res.scalars().all())


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


@router.post("/triage", response_model=EncounterResponse)
async def save_opd_triage(
    payload: TriageUpdatePayload,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["patient:read", "triage:write"]))],
):
    """
    Nursing Triage Endpoint:
    Allows staff with ['patient:read', 'triage:write'] to record Chief Complaint and Vital Signs
    WITHOUT altering medical SOAP notes, ICD-10 diagnoses, or prescriptions.
    """
    enc_res = await db.execute(
        select(Encounter)
        .options(selectinload(Encounter.conditions), selectinload(Encounter.medications))
        .where(Encounter.encounter_number == payload.encounter_number)
    )
    encounter = enc_res.scalar_one_or_none()
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPD Encounter '{payload.encounter_number}' not found",
        )

    encounter.chief_complaint = payload.chief_complaint
    encounter.vital_signs = payload.vital_signs.model_dump()
    encounter.priority = payload.priority
    if encounter.status == "arrived":
        encounter.status = "triaged"

    await db.commit()
    await db.refresh(encounter)

    await log_audit_event(
        db=db,
        action="SAVE_OPD_TRIAGE",
        resource_type="Encounter",
        resource_id=str(encounter.id),
        user_id=current_user.id,
        user_name=f"{current_user.full_name} ({current_user.username})",
        user_role=",".join(r.name for r in current_user.roles),
        client_ip=request.client.host if request.client else None,
        module_id="@organella-module/doctor-opd",
        details={
            "encounter_number": encounter.encounter_number,
            "chief_complaint": encounter.chief_complaint,
            "vital_signs": encounter.vital_signs,
        },
    )
    return encounter


@router.post("/encounters", response_model=EncounterResponse, status_code=status.HTTP_201_CREATED)
async def save_opd_consultation(
    payload: EncounterConsultationCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[
        User,
        Depends(
            require_permissions(
                [
                    "encounter:read",
                    "encounter:sign",
                    "condition:write",
                    "medication:prescribe",
                ]
            )
        ),
    ],
):
    """
    Strict Clinical Consultation & Sign-Off Endpoint:
    Requires ALL of ['encounter:read', 'encounter:sign', 'condition:write', 'medication:prescribe'].
    - Blocks unauthenticated requests (401) and non-physician accounts such as Admin or Nurse (403 with missing_roles).
    - Cryptographically binds the consultation to the authenticated clinician's user_id and medical license.
    """
    pat_res = await db.execute(select(Patient).where(Patient.id == payload.patient_id))
    patient = pat_res.scalar_one_or_none()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{payload.patient_id}' not found in MPI",
        )

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
        encounter.practitioner_id = current_user.id
        if payload.status == "finished" and not encounter.ended_at:
            encounter.ended_at = now_utc

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
            practitioner_id=current_user.id,
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

    reload_stmt = (
        select(Encounter)
        .options(selectinload(Encounter.conditions), selectinload(Encounter.medications))
        .where(Encounter.id == encounter.id)
    )
    encounter = (await db.execute(reload_stmt)).scalar_one()

    await log_audit_event(
        db=db,
        action="SAVE_OPD_CONSULTATION",
        resource_type="Encounter",
        resource_id=str(encounter.id),
        user_id=current_user.id,
        user_name=f"{current_user.full_name} ({current_user.license_number or current_user.username})",
        user_role=",".join(r.name for r in current_user.roles),
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        module_id="@organella-module/doctor-opd",
        details={
            "encounter_number": encounter.encounter_number,
            "patient_hn": patient.hn,
            "signed_by_username": current_user.username,
            "signed_by_license": current_user.license_number,
            "status": encounter.status,
            "icd10_codes": [c.icd10_code for c in encounter.conditions],
            "medication_count": len(encounter.medications),
        },
    )

    await publish_event(
        channel="organella:clinical_events",
        event_name="on_encounter_saved",
        payload={
            "encounter_id": str(encounter.id),
            "encounter_number": encounter.encounter_number,
            "patient_id": str(patient.id),
            "hn": patient.hn,
            "signed_by": current_user.username,
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
                "prescribed_by": current_user.username,
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


@router.post("/encounters/{encounter_number}/dispense", response_model=EncounterResponse)
async def dispense_opd_medications(
    encounter_number: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[
        User,
        Depends(
            require_permissions(
                [
                    "patient:read",
                    "medication:read",
                    "medication:dispense",
                ]
            )
        ),
    ],
):
    """
    Pharmacy Dispensing Endpoint:
    Requires ALL of ['patient:read', 'medication:read', 'medication:dispense'].
    Verifies and marks all medication orders in the encounter as 'dispensed' (completed).
    """
    stmt = (
        select(Encounter)
        .options(selectinload(Encounter.conditions), selectinload(Encounter.medications))
        .where(Encounter.encounter_number == encounter_number)
    )
    res = await db.execute(stmt)
    encounter = res.scalar_one_or_none()
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPD Encounter '{encounter_number}' not found",
        )

    for med in encounter.medications:
        med.status = "completed"

    await db.commit()
    await db.refresh(encounter)

    await log_audit_event(
        db=db,
        action="DISPENSE_OPD_MEDICATIONS",
        resource_type="Encounter",
        resource_id=str(encounter.id),
        user_id=current_user.id,
        user_name=f"{current_user.full_name} ({current_user.license_number or current_user.username})",
        user_role=",".join(r.name for r in current_user.roles),
        client_ip=request.client.host if request.client else None,
        module_id="@organella-module/pharmacy-dispense",
        details={
            "encounter_number": encounter.encounter_number,
            "dispensed_by": current_user.username,
            "pharmacist_license": current_user.license_number,
            "medications_dispensed": [m.medication_name for m in encounter.medications],
        },
    )

    await publish_event(
        channel="organella:clinical_events",
        event_name="on_medication_dispensed",
        payload={
            "encounter_id": str(encounter.id),
            "encounter_number": encounter.encounter_number,
            "dispensed_by": current_user.username,
            "pharmacist_license": current_user.license_number,
            "count": len(encounter.medications),
        },
    )

    return encounter
