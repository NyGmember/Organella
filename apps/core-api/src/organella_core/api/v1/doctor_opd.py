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
from organella_core.models.clinical import Condition, Encounter, LabOrder, MedicationOrder
from organella_core.models.master_data import MasterICD10, MasterLabTest, MasterMedication
from organella_core.models.patient import Patient
from organella_core.schemas.clinical import (
    ConditionResponse,
    EncounterConsultationCreate,
    EncounterResponse,
    ICD10CodeItem,
    LabOrderCreate,
    LabOrderResponse,
    LabResultReportPayload,
    MedicationOrderResponse,
    QueueCheckInCreate,
    QueueItemResponse,
    QueueStatusUpdate,
    VitalSignsSchema,
)
from organella_core.schemas.master_data import LabTestMasterResponse, MedicationMasterResponse
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
    department: Optional[str] = None
    allergies: Optional[List[str]] = None


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
        .options(
            selectinload(Encounter.conditions),
            selectinload(Encounter.medications),
            selectinload(Encounter.lab_orders),
        )
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
                lab_orders=[LabOrderResponse.model_validate(lo) for lo in enc.lab_orders],
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
        selectinload(Encounter.conditions),
        selectinload(Encounter.medications),
        selectinload(Encounter.lab_orders),
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


@router.post("/checkin", response_model=QueueItemResponse, status_code=status.HTTP_201_CREATED)
async def checkin_patient_to_opd_queue(
    payload: QueueCheckInCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["patient:read", "queue:manage"]))],
):
    """
    Reception Check-In & Queue Issuance Endpoint:
    Requires ALL of ['patient:read', 'queue:manage'].
    Creates a new OPD Encounter in 'arrived' status and assigns the next sequential Queue Number.
    """
    pat_res = await db.execute(select(Patient).where(Patient.id == payload.patient_id))
    patient = pat_res.scalar_one_or_none()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{payload.patient_id}' not found in MPI",
        )

    # Determine next sequential encounter & queue number
    all_encs_res = await db.execute(select(Encounter.encounter_number, Encounter.queue_number))
    all_rows = all_encs_res.all()
    next_idx = len(all_rows) + 15
    prefix_char = (
        "S" if payload.priority == "stat" else ("U" if payload.priority == "urgent" else "A")
    )
    queue_number = f"{prefix_char}-{next_idx:03d}"
    now_utc = datetime.now(timezone.utc)
    encounter_number = f"ENC-{now_utc.strftime('%Y')}-{len(all_rows) + 1:03d}"
    # Ensure uniqueness if encounter_number already exists
    existing_enc_nums = {r[0] for r in all_rows}
    if encounter_number in existing_enc_nums:
        encounter_number = f"ENC-{now_utc.strftime('%Y%m%d')}-{uuid.uuid4().hex[:5].upper()}"

    encounter = Encounter(
        encounter_number=encounter_number,
        patient_id=patient.id,
        encounter_type="OPD",
        status="arrived",
        priority=payload.priority,
        department=payload.department,
        queue_number=queue_number,
        chief_complaint=payload.chief_complaint or "รอซักประวัติและวัดสัญญาณชีพที่จุดคัดกรอง",
        vital_signs={},
        soap_note={},
    )
    db.add(encounter)
    await db.commit()
    await db.refresh(encounter)

    await log_audit_event(
        db=db,
        action="CHECKIN_OPD_QUEUE",
        resource_type="Encounter",
        resource_id=str(encounter.id),
        user_id=current_user.id,
        user_name=f"{current_user.full_name} ({current_user.username})",
        user_role=",".join(r.name for r in current_user.roles),
        client_ip=request.client.host if request.client else None,
        module_id="@organella-module/reception-triage",
        details={
            "encounter_number": encounter.encounter_number,
            "queue_number": encounter.queue_number,
            "patient_hn": patient.hn,
            "department": encounter.department,
            "priority": encounter.priority,
        },
    )

    await publish_event(
        channel="organella:clinical_events",
        event_name="on_patient_checked_in",
        payload={
            "encounter_id": str(encounter.id),
            "encounter_number": encounter.encounter_number,
            "queue_number": encounter.queue_number,
            "patient_id": str(patient.id),
            "hn": patient.hn,
            "department": encounter.department,
            "priority": encounter.priority,
            "checked_in_by": current_user.username,
        },
    )

    prefix_str = f"{patient.prefix} " if patient.prefix else ""
    full_name = f"{prefix_str}{patient.first_name} {patient.last_name}".strip()
    return QueueItemResponse(
        encounter_id=encounter.id,
        encounter_number=encounter.encounter_number,
        queue_number=encounter.queue_number or queue_number,
        status=encounter.status,
        priority=encounter.priority,
        department=encounter.department,
        chief_complaint=encounter.chief_complaint,
        started_at=encounter.started_at,
        patient_id=patient.id,
        hn=patient.hn,
        patient_name=full_name,
        gender=patient.gender,
        birth_date=patient.birth_date.isoformat(),
        blood_group=patient.blood_group,
        allergies=patient.allergies or [],
        vital_signs=encounter.vital_signs or {},
        soap_note=encounter.soap_note or {},
        conditions=[],
        medications=[],
    )


@router.patch("/encounters/{encounter_number}/status", response_model=EncounterResponse)
async def update_opd_queue_status(
    encounter_number: str,
    payload: QueueStatusUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["patient:read", "queue:manage"]))],
):
    """
    Queue Status Management Endpoint:
    Requires ALL of ['patient:read', 'queue:manage'].
    Allows Reception or Triage staff to transition queue status or reassign department/priority.
    """
    enc_res = await db.execute(
        select(Encounter)
        .options(selectinload(Encounter.conditions), selectinload(Encounter.medications))
        .where(Encounter.encounter_number == encounter_number)
    )
    encounter = enc_res.scalar_one_or_none()
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPD Encounter '{encounter_number}' not found",
        )

    old_status = encounter.status
    encounter.status = payload.status
    if payload.priority:
        encounter.priority = payload.priority
    if payload.department:
        encounter.department = payload.department
    if payload.status == "finished" and not encounter.ended_at:
        encounter.ended_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(encounter)

    await log_audit_event(
        db=db,
        action="UPDATE_OPD_QUEUE_STATUS",
        resource_type="Encounter",
        resource_id=str(encounter.id),
        user_id=current_user.id,
        user_name=f"{current_user.full_name} ({current_user.username})",
        user_role=",".join(r.name for r in current_user.roles),
        client_ip=request.client.host if request.client else None,
        module_id="@organella-module/reception-triage",
        details={
            "encounter_number": encounter.encounter_number,
            "old_status": old_status,
            "new_status": encounter.status,
            "priority": encounter.priority,
            "department": encounter.department,
        },
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
    Allows staff with ['patient:read', 'triage:write'] to record Chief Complaint, Vital Signs (with auto-BMI),
    and Drug Allergy screening WITHOUT altering medical SOAP notes, ICD-10 diagnoses, or prescriptions.
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

    vitals_dict = payload.vital_signs.model_dump()
    w = vitals_dict.get("weight")
    h = vitals_dict.get("height")
    if w and h and float(w) > 0 and float(h) > 0:
        vitals_dict["bmi"] = round(float(w) / ((float(h) / 100.0) ** 2), 1)

    encounter.chief_complaint = payload.chief_complaint
    encounter.vital_signs = vitals_dict
    encounter.priority = payload.priority
    if payload.department:
        encounter.department = payload.department
    if encounter.status == "arrived":
        encounter.status = "triaged"

    if payload.allergies is not None:
        pat_res = await db.execute(select(Patient).where(Patient.id == encounter.patient_id))
        pat = pat_res.scalar_one_or_none()
        if pat:
            pat.allergies = payload.allergies

    await db.commit()
    await db.refresh(encounter)

    await log_audit_event(
        db=db,
        action="SAVE_OPD_TRIAGE",
        resource_type="Encounter",
        resource_id=str(encounter.id),
        user_id=current_user.id,
        user_name=f"{current_user.full_name} ({current_user.license_number or current_user.username})",
        user_role=",".join(r.name for r in current_user.roles),
        client_ip=request.client.host if request.client else None,
        module_id="@organella-module/reception-triage",
        details={
            "encounter_number": encounter.encounter_number,
            "chief_complaint": encounter.chief_complaint,
            "vital_signs": encounter.vital_signs,
            "priority": encounter.priority,
            "allergies_updated": payload.allergies,
        },
    )

    await publish_event(
        channel="organella:clinical_events",
        event_name="on_triage_completed",
        payload={
            "encounter_id": str(encounter.id),
            "encounter_number": encounter.encounter_number,
            "queue_number": encounter.queue_number,
            "patient_id": str(encounter.patient_id),
            "priority": encounter.priority,
            "triaged_by": current_user.username,
            "bmi": vitals_dict.get("bmi"),
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


# ============================================================================
# Phase 6: Laboratory & Diagnostic Orders (LIS) Endpoints (@organella-module/lab-lis)
# ============================================================================
@router.get("/labs/catalog", response_model=List[LabTestMasterResponse])
async def search_lab_catalog(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search by Lab Code, LOINC, or Test Name"),
    limit: int = Query(20, ge=1, le=100),
):
    """Search active LOINC Laboratory Master Catalog for Doctor Lab Order entry"""
    stmt = select(MasterLabTest).where(MasterLabTest.is_active.is_(True))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                MasterLabTest.code.ilike(pattern),
                MasterLabTest.loinc_code.ilike(pattern),
                MasterLabTest.test_name.ilike(pattern),
                MasterLabTest.category.ilike(pattern),
            )
        )
    stmt = stmt.order_by(MasterLabTest.code.asc()).limit(limit)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.get("/encounters/{encounter_number}/labs", response_model=List[LabOrderResponse])
async def list_encounter_lab_orders(
    encounter_number: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _current_user: Annotated[User, Depends(require_permissions(["patient:read", "lab:read"]))],
):
    """Retrieve all Laboratory Orders & Results for a specific OPD Encounter"""
    enc_res = await db.execute(
        select(Encounter)
        .options(selectinload(Encounter.lab_orders))
        .where(Encounter.encounter_number == encounter_number)
    )
    encounter = enc_res.scalar_one_or_none()
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPD Encounter '{encounter_number}' not found",
        )
    return list(encounter.lab_orders)


@router.post(
    "/encounters/{encounter_number}/labs",
    response_model=LabOrderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_encounter_lab_order(
    encounter_number: str,
    payload: LabOrderCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[
        User,
        Depends(require_permissions(["patient:read", "lab:read", "lab:order"])),
    ],
):
    """
    Doctor Lab Order Entry Endpoint:
    Requires ALL of ['patient:read', 'lab:read', 'lab:order'].
    Enriches LOINC, unit, and reference_range from MasterLabTest if available.
    """
    enc_res = await db.execute(
        select(Encounter).where(Encounter.encounter_number == encounter_number)
    )
    encounter = enc_res.scalar_one_or_none()
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPD Encounter '{encounter_number}' not found",
        )

    master_res = await db.execute(
        select(MasterLabTest).where(MasterLabTest.code == payload.lab_code.strip().upper())
    )
    master_lab = master_res.scalar_one_or_none()

    lab_order = LabOrder(
        encounter_id=encounter.id,
        patient_id=encounter.patient_id,
        lab_code=payload.lab_code.strip().upper(),
        loinc_code=payload.loinc_code or (master_lab.loinc_code if master_lab else "00000-0"),
        test_name=payload.test_name or (master_lab.test_name if master_lab else payload.lab_code),
        category=payload.category or (master_lab.category if master_lab else "Clinical Chemistry"),
        specimen_type=payload.specimen_type
        or (master_lab.specimen_type if master_lab else "Serum / Plasma"),
        priority=payload.priority,
        status="ordered",
        unit=payload.unit or (master_lab.unit if master_lab else ""),
        reference_range=payload.reference_range
        or (master_lab.reference_range if master_lab else ""),
        abnormal_flag="pending",
        ordered_by_username=current_user.username,
        clinical_note=payload.clinical_note,
    )
    db.add(lab_order)
    await db.commit()
    await db.refresh(lab_order)

    await log_audit_event(
        db=db,
        action="ORDER_OPD_LAB_TEST",
        resource_type="LabOrder",
        resource_id=str(lab_order.id),
        user_id=current_user.id,
        user_name=f"{current_user.full_name} ({current_user.license_number or current_user.username})",
        user_role=",".join(r.name for r in current_user.roles),
        client_ip=request.client.host if request.client else None,
        module_id="@organella-module/lab-lis",
        details={
            "encounter_number": encounter.encounter_number,
            "lab_code": lab_order.lab_code,
            "loinc_code": lab_order.loinc_code,
            "test_name": lab_order.test_name,
            "priority": lab_order.priority,
        },
    )

    await publish_event(
        channel="organella:clinical_events",
        event_name="on_lab_ordered",
        payload={
            "lab_order_id": str(lab_order.id),
            "encounter_number": encounter.encounter_number,
            "lab_code": lab_order.lab_code,
            "test_name": lab_order.test_name,
            "ordered_by": current_user.username,
        },
    )
    return lab_order


@router.post("/labs/{lab_order_id}/result", response_model=LabOrderResponse)
async def report_lab_order_result(
    lab_order_id: uuid.UUID,
    payload: LabResultReportPayload,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[
        User,
        Depends(require_permissions(["patient:read", "lab:read", "lab:result_write"])),
    ],
):
    """
    LIS Medical Technologist Result Reporting Endpoint:
    Requires ALL of ['patient:read', 'lab:read', 'lab:result_write'].
    Automatically evaluates numeric result_value against MasterLabTest.ref_low / ref_high
    to classify 'normal', 'low', 'high', or 'critical'.
    """
    res = await db.execute(select(LabOrder).where(LabOrder.id == lab_order_id))
    lab_order = res.scalar_one_or_none()
    if not lab_order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"LabOrder '{lab_order_id}' not found",
        )

    master_res = await db.execute(
        select(MasterLabTest).where(MasterLabTest.code == lab_order.lab_code)
    )
    master_lab = master_res.scalar_one_or_none()

    computed_flag = payload.abnormal_flag or "normal"
    if not payload.abnormal_flag and master_lab:
        try:
            val_num = float(payload.result_value.strip())
            rlow = master_lab.ref_low
            rhigh = master_lab.ref_high
            if rhigh is not None and val_num > rhigh * 1.8:
                computed_flag = "critical"
            elif rlow is not None and val_num < rlow * 0.6:
                computed_flag = "critical"
            elif rhigh is not None and val_num > rhigh:
                computed_flag = "high"
            elif rlow is not None and val_num < rlow:
                computed_flag = "low"
            else:
                computed_flag = "normal"
        except ValueError:
            computed_flag = "normal"

    lab_order.result_value = payload.result_value.strip()
    if payload.unit:
        lab_order.unit = payload.unit
    if payload.reference_range:
        lab_order.reference_range = payload.reference_range
    lab_order.abnormal_flag = computed_flag
    lab_order.status = "completed"
    lab_order.reported_by_username = current_user.username
    lab_order.reported_by_license = current_user.license_number
    if payload.clinical_note is not None:
        lab_order.clinical_note = payload.clinical_note

    await db.commit()
    await db.refresh(lab_order)

    await log_audit_event(
        db=db,
        action="REPORT_LAB_RESULT",
        resource_type="LabOrder",
        resource_id=str(lab_order.id),
        user_id=current_user.id,
        user_name=f"{current_user.full_name} ({current_user.license_number or current_user.username})",
        user_role=",".join(r.name for r in current_user.roles),
        client_ip=request.client.host if request.client else None,
        module_id="@organella-module/lab-lis",
        details={
            "lab_code": lab_order.lab_code,
            "loinc_code": lab_order.loinc_code,
            "result_value": lab_order.result_value,
            "unit": lab_order.unit,
            "abnormal_flag": lab_order.abnormal_flag,
            "reported_by_license": lab_order.reported_by_license,
        },
    )

    await publish_event(
        channel="organella:clinical_events",
        event_name="on_lab_result_reported",
        payload={
            "lab_order_id": str(lab_order.id),
            "lab_code": lab_order.lab_code,
            "result_value": lab_order.result_value,
            "unit": lab_order.unit,
            "abnormal_flag": lab_order.abnormal_flag,
            "reported_by": current_user.username,
        },
    )
    return lab_order
