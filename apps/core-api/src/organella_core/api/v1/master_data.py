import csv
import io
from datetime import date
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from organella_core.database import get_db
from organella_core.models.audit import AuditLog
from organella_core.models.auth import User
from organella_core.models.master_data import MasterICD10, MasterLabTest, MasterMedication
from organella_core.models.patient import Patient
from organella_core.schemas.master_data import (
    AuditLogResponse,
    BulkImportResult,
    ICD10BulkImportRequest,
    ICD10MasterCreate,
    ICD10MasterResponse,
    LabTestBulkImportRequest,
    LabTestMasterCreate,
    LabTestMasterResponse,
    MedicationBulkImportRequest,
    MedicationMasterCreate,
    MedicationMasterResponse,
    PatientBulkImportRequest,
    PatientImportItem,
)
from organella_core.security import require_permissions
from organella_core.services.audit import log_audit_event

router = APIRouter(
    prefix="/master-data",
    tags=["Master Data Management & Bulk Import (ICD-10, Formulary, MPI, Audit)"],
)


# ============================================================================
# 1. ICD-10 Terminology Master Data & Bulk Import
# ============================================================================
@router.get("/icd10", response_model=List[ICD10MasterResponse])
async def list_master_icd10(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search by ICD-10 code, English or Thai name"),
    category: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Query ICD-10 Master Data table"""
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
    if category:
        stmt = stmt.where(MasterICD10.category == category)

    stmt = stmt.order_by(MasterICD10.code.asc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/icd10", response_model=ICD10MasterResponse, status_code=status.HTTP_201_CREATED)
async def upsert_master_icd10(
    payload: ICD10MasterCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["masterdata:icd10"]))],
):
    """Create or update a single ICD-10 code (Requires 'masterdata:icd10')"""
    code_upper = payload.code.strip().upper()
    res = await db.execute(select(MasterICD10).where(MasterICD10.code == code_upper))
    item = res.scalar_one_or_none()

    if item:
        item.display_en = payload.display_en
        item.display_th = payload.display_th
        item.category = payload.category
        item.is_active = payload.is_active
    else:
        item = MasterICD10(
            code=code_upper,
            display_en=payload.display_en,
            display_th=payload.display_th,
            category=payload.category,
            is_active=payload.is_active,
        )
        db.add(item)

    await db.commit()
    await db.refresh(item)

    await log_audit_event(
        db=db,
        action="UPSERT_MASTER_ICD10",
        resource_type="MasterICD10",
        resource_id=item.code,
        user_id=current_user.id,
        user_name=current_user.username,
        client_ip=request.client.host if request.client else None,
        details=payload.model_dump(),
    )
    return item


@router.post("/icd10/import", response_model=BulkImportResult)
async def bulk_import_icd10(
    payload: ICD10BulkImportRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["masterdata:icd10"]))],
):
    """Bulk import ICD-10 codes from JSON items or CSV text (Requires 'masterdata:icd10')"""
    records: List[ICD10MasterCreate] = list(payload.items or [])

    if payload.csv_text and payload.csv_text.strip():
        reader = csv.DictReader(io.StringIO(payload.csv_text.strip()))
        for row in reader:
            code = (row.get("code") or "").strip()
            display_en = (row.get("display_en") or row.get("display") or "").strip()
            if code and display_en:
                records.append(
                    ICD10MasterCreate(
                        code=code,
                        display_en=display_en,
                        display_th=(row.get("display_th") or "").strip() or None,
                        category=(row.get("category") or "General").strip(),
                    )
                )

    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ไม่พบรายการข้อมูล ICD-10 สำหรับนำเข้า (No valid ICD-10 records provided)",
        )

    imported = 0
    updated = 0
    for rec in records:
        code_upper = rec.code.strip().upper()
        res = await db.execute(select(MasterICD10).where(MasterICD10.code == code_upper))
        existing = res.scalar_one_or_none()
        if existing:
            existing.display_en = rec.display_en
            existing.display_th = rec.display_th
            existing.category = rec.category
            existing.is_active = rec.is_active
            updated += 1
        else:
            db.add(
                MasterICD10(
                    code=code_upper,
                    display_en=rec.display_en,
                    display_th=rec.display_th,
                    category=rec.category,
                    is_active=rec.is_active,
                )
            )
            imported += 1

    await db.commit()

    await log_audit_event(
        db=db,
        action="BULK_IMPORT_ICD10",
        resource_type="MasterICD10",
        user_id=current_user.id,
        user_name=current_user.username,
        client_ip=request.client.host if request.client else None,
        details={"imported": imported, "updated": updated, "total": len(records)},
    )

    return BulkImportResult(
        resource_type="MasterICD10",
        imported_count=imported,
        updated_count=updated,
        total_processed=len(records),
    )


# ============================================================================
# 2. Hospital Drug Formulary Master Data & Bulk Import
# ============================================================================
@router.get("/medications", response_model=List[MedicationMasterResponse])
async def list_master_medications(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(
        None, description="Search by drug code, generic name, or allergy class"
    ),
    limit: int = Query(50, ge=1, le=200),
):
    """Query Hospital Drug Formulary Master Data table"""
    stmt = select(MasterMedication).where(MasterMedication.is_active.is_(True))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                MasterMedication.code.ilike(pattern),
                MasterMedication.generic_name.ilike(pattern),
                MasterMedication.trade_name.ilike(pattern),
                MasterMedication.drug_allergy_class.ilike(pattern),
            )
        )
    stmt = stmt.order_by(MasterMedication.generic_name.asc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post(
    "/medications",
    response_model=MedicationMasterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upsert_master_medication(
    payload: MedicationMasterCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["masterdata:medications"]))],
):
    """Create or update a Drug Formulary item (Requires 'masterdata:medications')"""
    code_upper = payload.code.strip().upper()
    res = await db.execute(select(MasterMedication).where(MasterMedication.code == code_upper))
    item = res.scalar_one_or_none()

    if item:
        item.generic_name = payload.generic_name
        item.trade_name = payload.trade_name
        item.strength = payload.strength
        item.dosage_form = payload.dosage_form
        item.default_dosage = payload.default_dosage
        item.unit = payload.unit
        item.drug_allergy_class = payload.drug_allergy_class
        item.is_active = payload.is_active
    else:
        item = MasterMedication(
            code=code_upper,
            generic_name=payload.generic_name,
            trade_name=payload.trade_name,
            strength=payload.strength,
            dosage_form=payload.dosage_form,
            default_dosage=payload.default_dosage,
            unit=payload.unit,
            drug_allergy_class=payload.drug_allergy_class,
            is_active=payload.is_active,
        )
        db.add(item)

    await db.commit()
    await db.refresh(item)

    await log_audit_event(
        db=db,
        action="UPSERT_MASTER_MEDICATION",
        resource_type="MasterMedication",
        resource_id=item.code,
        user_id=current_user.id,
        user_name=current_user.username,
        client_ip=request.client.host if request.client else None,
        details=payload.model_dump(),
    )
    return item


@router.post("/medications/import", response_model=BulkImportResult)
async def bulk_import_medications(
    payload: MedicationBulkImportRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["masterdata:medications"]))],
):
    """Bulk import Drug Formulary from JSON items or CSV text (Requires 'masterdata:medications')"""
    records: List[MedicationMasterCreate] = list(payload.items or [])

    if payload.csv_text and payload.csv_text.strip():
        reader = csv.DictReader(io.StringIO(payload.csv_text.strip()))
        for row in reader:
            code = (row.get("code") or "").strip()
            generic_name = (row.get("generic_name") or "").strip()
            if code and generic_name:
                records.append(
                    MedicationMasterCreate(
                        code=code,
                        generic_name=generic_name,
                        trade_name=(row.get("trade_name") or "").strip() or None,
                        strength=(row.get("strength") or "").strip() or None,
                        dosage_form=(row.get("dosage_form") or "tablet").strip(),
                        default_dosage=(row.get("default_dosage") or "รับประทานตามแพทย์สั่ง").strip(),
                        unit=(row.get("unit") or "tablet").strip(),
                        drug_allergy_class=(row.get("drug_allergy_class") or "").strip() or None,
                    )
                )

    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ไม่พบรายการยาสำหรับนำเข้า (No valid medication records provided)",
        )

    imported = 0
    updated = 0
    for rec in records:
        code_upper = rec.code.strip().upper()
        res = await db.execute(select(MasterMedication).where(MasterMedication.code == code_upper))
        existing = res.scalar_one_or_none()
        if existing:
            existing.generic_name = rec.generic_name
            existing.trade_name = rec.trade_name
            existing.strength = rec.strength
            existing.dosage_form = rec.dosage_form
            existing.default_dosage = rec.default_dosage
            existing.unit = rec.unit
            existing.drug_allergy_class = rec.drug_allergy_class
            existing.is_active = rec.is_active
            updated += 1
        else:
            db.add(
                MasterMedication(
                    code=code_upper,
                    generic_name=rec.generic_name,
                    trade_name=rec.trade_name,
                    strength=rec.strength,
                    dosage_form=rec.dosage_form,
                    default_dosage=rec.default_dosage,
                    unit=rec.unit,
                    drug_allergy_class=rec.drug_allergy_class,
                    is_active=rec.is_active,
                )
            )
            imported += 1

    await db.commit()

    await log_audit_event(
        db=db,
        action="BULK_IMPORT_MEDICATIONS",
        resource_type="MasterMedication",
        user_id=current_user.id,
        user_name=current_user.username,
        client_ip=request.client.host if request.client else None,
        details={"imported": imported, "updated": updated, "total": len(records)},
    )

    return BulkImportResult(
        resource_type="MasterMedication",
        imported_count=imported,
        updated_count=updated,
        total_processed=len(records),
    )


# ============================================================================
# 3. MPI Patient Bulk Import
# ============================================================================
@router.post("/patients/import", response_model=BulkImportResult)
async def bulk_import_patients(
    payload: PatientBulkImportRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["masterdata:patients"]))],
):
    """Bulk import MPI Patients from JSON items or CSV text (Requires 'masterdata:patients')"""
    records: List[PatientImportItem] = list(payload.items or [])

    if payload.csv_text and payload.csv_text.strip():
        reader = csv.DictReader(io.StringIO(payload.csv_text.strip()))
        for row in reader:
            hn = (row.get("hn") or "").strip()
            first_name = (row.get("first_name") or "").strip()
            last_name = (row.get("last_name") or "").strip()
            if hn and first_name and last_name:
                bdate_str = (row.get("birth_date") or "1985-01-01").strip()
                try:
                    bdate = date.fromisoformat(bdate_str)
                except ValueError:
                    bdate = date(1985, 1, 1)
                allergies_raw = (row.get("allergies") or "").strip()
                allergies = (
                    [a.strip() for a in allergies_raw.split("|") if a.strip()]
                    if allergies_raw
                    else []
                )
                records.append(
                    PatientImportItem(
                        hn=hn,
                        citizen_id=(row.get("citizen_id") or "").strip() or None,
                        prefix=(row.get("prefix") or "คุณ").strip(),
                        first_name=first_name,
                        last_name=last_name,
                        gender=(row.get("gender") or "unknown").strip(),
                        birth_date=bdate,
                        blood_group=(row.get("blood_group") or "O+").strip(),
                        allergies=allergies,
                    )
                )

    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ไม่พบรายการผู้ป่วยสำหรับนำเข้า (No valid patient records provided)",
        )

    imported = 0
    updated = 0
    for rec in records:
        res = await db.execute(select(Patient).where(Patient.hn == rec.hn))
        existing = res.scalar_one_or_none()
        if existing:
            existing.citizen_id = rec.citizen_id
            existing.prefix = rec.prefix
            existing.first_name = rec.first_name
            existing.last_name = rec.last_name
            existing.gender = rec.gender
            existing.birth_date = rec.birth_date
            existing.blood_group = rec.blood_group
            existing.allergies = rec.allergies
            updated += 1
        else:
            db.add(
                Patient(
                    hn=rec.hn,
                    citizen_id=rec.citizen_id,
                    prefix=rec.prefix,
                    first_name=rec.first_name,
                    last_name=rec.last_name,
                    gender=rec.gender,
                    birth_date=rec.birth_date,
                    blood_group=rec.blood_group,
                    allergies=rec.allergies,
                    contact_info={},
                    address={},
                )
            )
            imported += 1

    await db.commit()

    await log_audit_event(
        db=db,
        action="BULK_IMPORT_PATIENTS",
        resource_type="Patient",
        user_id=current_user.id,
        user_name=current_user.username,
        client_ip=request.client.host if request.client else None,
        details={"imported": imported, "updated": updated, "total": len(records)},
    )

    return BulkImportResult(
        resource_type="Patient",
        imported_count=imported,
        updated_count=updated,
        total_processed=len(records),
    )


# ============================================================================
# 4. System Audit Trail Inspection
# ============================================================================
@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def list_audit_logs(
    db: Annotated[AsyncSession, Depends(get_db)],
    _current_user: Annotated[User, Depends(require_permissions(["audit:read"]))],
    limit: int = Query(50, ge=1, le=200),
):
    """Retrieve system PDPA/HIPAA Audit Logs (Requires 'audit:read')"""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ============================================================================
# 5. Laboratory Test Catalog (LOINC) Master Data & Bulk Import
# ============================================================================
@router.get("/labs", response_model=List[LabTestMasterResponse])
async def list_master_labs(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search by Lab Code, LOINC, or Test Name"),
    category: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Query LOINC Laboratory Master Catalog"""
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
    if category:
        stmt = stmt.where(MasterLabTest.category == category)
    stmt = stmt.order_by(MasterLabTest.code.asc()).limit(limit)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/labs/import", response_model=BulkImportResult)
async def bulk_import_labs(
    payload: LabTestBulkImportRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["masterdata:labs"]))],
):
    """Bulk import Laboratory Test Catalog from JSON or CSV (Requires 'masterdata:labs')"""
    records: List[LabTestMasterCreate] = list(payload.items or [])

    if payload.csv_text and payload.csv_text.strip():
        reader = csv.DictReader(io.StringIO(payload.csv_text.strip()))
        for row in reader:
            code = (row.get("code") or "").strip()
            loinc_code = (row.get("loinc_code") or "").strip()
            test_name = (row.get("test_name") or "").strip()
            if code and test_name:
                rlow_str = (row.get("ref_low") or "").strip()
                rhigh_str = (row.get("ref_high") or "").strip()
                records.append(
                    LabTestMasterCreate(
                        code=code,
                        loinc_code=loinc_code or "00000-0",
                        test_name=test_name,
                        category=(row.get("category") or "Clinical Chemistry").strip(),
                        specimen_type=(row.get("specimen_type") or "Serum / Plasma").strip(),
                        unit=(row.get("unit") or "mg/dL").strip(),
                        reference_range=(row.get("reference_range") or "").strip(),
                        ref_low=float(rlow_str) if rlow_str else None,
                        ref_high=float(rhigh_str) if rhigh_str else None,
                    )
                )

    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ไม่พบรายการตรวจแล็บสำหรับนำเข้า (No valid Lab Test records provided)",
        )

    imported = 0
    updated = 0
    for rec in records:
        code_upper = rec.code.strip().upper()
        res = await db.execute(select(MasterLabTest).where(MasterLabTest.code == code_upper))
        existing = res.scalar_one_or_none()
        if existing:
            existing.loinc_code = rec.loinc_code
            existing.test_name = rec.test_name
            existing.category = rec.category
            existing.specimen_type = rec.specimen_type
            existing.unit = rec.unit
            existing.reference_range = rec.reference_range
            existing.ref_low = rec.ref_low
            existing.ref_high = rec.ref_high
            existing.is_active = rec.is_active
            updated += 1
        else:
            db.add(
                MasterLabTest(
                    code=code_upper,
                    loinc_code=rec.loinc_code,
                    test_name=rec.test_name,
                    category=rec.category,
                    specimen_type=rec.specimen_type,
                    unit=rec.unit,
                    reference_range=rec.reference_range,
                    ref_low=rec.ref_low,
                    ref_high=rec.ref_high,
                    is_active=rec.is_active,
                )
            )
            imported += 1

    await db.commit()

    await log_audit_event(
        db=db,
        action="BULK_IMPORT_LAB_CATALOG",
        resource_type="MasterLabTest",
        user_id=current_user.id,
        user_name=current_user.username,
        client_ip=request.client.host if request.client else None,
        details={"imported": imported, "updated": updated, "total": len(records)},
    )

    return BulkImportResult(
        resource_type="MasterLabTest",
        imported_count=imported,
        updated_count=updated,
        total_processed=len(records),
    )
