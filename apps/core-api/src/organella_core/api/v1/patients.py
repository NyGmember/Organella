import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from organella_core.database import get_db
from organella_core.models.auth import User
from organella_core.models.patient import Patient
from organella_core.schemas.patient import (
    PatientCreate,
    PatientListResponse,
    PatientResponse,
    PatientUpdate,
)
from organella_core.security import require_permission
from organella_core.services.audit import log_audit_event

router = APIRouter(prefix="/patients", tags=["Master Patient Index (MPI)"])


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_patient(
    payload: PatientCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patient:write"))],
):
    """Register a new patient record in the Master Patient Index"""
    # Check duplicate HN
    existing_hn = await db.execute(select(Patient).where(Patient.hn == payload.hn))
    if existing_hn.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Patient with HN '{payload.hn}' already exists",
        )

    # Check duplicate Citizen ID if provided
    if payload.citizen_id:
        existing_cid = await db.execute(
            select(Patient).where(Patient.citizen_id == payload.citizen_id)
        )
        if existing_cid.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Patient with Citizen ID '{payload.citizen_id}' already registered",
            )

    new_patient = Patient(
        hn=payload.hn,
        citizen_id=payload.citizen_id,
        prefix=payload.prefix,
        first_name=payload.first_name,
        last_name=payload.last_name,
        gender=payload.gender,
        birth_date=payload.birth_date,
        blood_group=payload.blood_group,
        allergies=payload.allergies,
        contact_info=payload.contact_info,
        address=payload.address,
        is_active=payload.is_active,
    )
    db.add(new_patient)
    await db.commit()
    await db.refresh(new_patient)

    # Audit Trail
    await log_audit_event(
        db=db,
        action="CREATE_PATIENT",
        resource_type="Patient",
        resource_id=str(new_patient.id),
        user_id=current_user.id,
        user_name=current_user.full_name,
        user_role=current_user.roles[0].name if current_user.roles else "Staff",
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"hn": new_patient.hn, "name": f"{new_patient.first_name} {new_patient.last_name}"},
    )

    # Publish Redis Event Bus Hook for Modules
    from organella_core.services.event_bus import publish_patient_event

    await publish_patient_event(
        event_name="on_patient_registered",
        patient_id=str(new_patient.id),
        hn=new_patient.hn,
        details={"name": f"{new_patient.first_name} {new_patient.last_name}"},
    )

    return new_patient


@router.get("", response_model=PatientListResponse)
async def search_patients(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patient:read"))],
    q: Optional[str] = Query(None, description="Search query across HN, Citizen ID, or Name"),
    hn: Optional[str] = Query(None, description="Exact match on Hospital Number"),
    citizen_id: Optional[str] = Query(None, description="Exact match on Citizen ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Search and list patient demographics in Master Patient Index"""
    stmt = select(Patient).where(Patient.is_active.is_(True))

    if hn:
        stmt = stmt.where(Patient.hn == hn)
    elif citizen_id:
        stmt = stmt.where(Patient.citizen_id == citizen_id)
    elif q:
        search_filter = or_(
            Patient.hn.ilike(f"%{q}%"),
            Patient.citizen_id.ilike(f"%{q}%"),
            Patient.first_name.ilike(f"%{q}%"),
            Patient.last_name.ilike(f"%{q}%"),
        )
        stmt = stmt.where(search_filter)

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Fetch items
    stmt = stmt.order_by(Patient.hn.asc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    patients = list(result.scalars().all())

    # Audit search event
    await log_audit_event(
        db=db,
        action="SEARCH_PATIENTS",
        resource_type="Patient",
        user_id=current_user.id,
        user_name=current_user.full_name,
        user_role=current_user.roles[0].name if current_user.roles else "Staff",
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"query": q, "hn": hn, "citizen_id": citizen_id, "results_count": len(patients)},
    )

    return PatientListResponse(total=total, items=patients)


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient_by_id(
    patient_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patient:read"))],
):
    """Retrieve full patient demographic record by UUID or HN"""
    stmt = select(Patient)
    try:
        val_uuid = uuid.UUID(patient_id)
        stmt = stmt.where(Patient.id == val_uuid)
    except ValueError:
        stmt = stmt.where(Patient.hn == patient_id)

    result = await db.execute(stmt)
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found",
        )

    # Audit chart view
    await log_audit_event(
        db=db,
        action="VIEW_PATIENT_CHART",
        resource_type="Patient",
        resource_id=str(patient.id),
        user_id=current_user.id,
        user_name=current_user.full_name,
        user_role=current_user.roles[0].name if current_user.roles else "Staff",
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"hn": patient.hn},
    )

    return patient


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patient:write"))],
):
    """Update patient demographic information"""
    stmt = select(Patient)
    try:
        val_uuid = uuid.UUID(patient_id)
        stmt = stmt.where(Patient.id == val_uuid)
    except ValueError:
        stmt = stmt.where(Patient.hn == patient_id)

    result = await db.execute(stmt)
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(patient, field, value)

    await db.commit()
    await db.refresh(patient)

    # Audit update
    await log_audit_event(
        db=db,
        action="UPDATE_PATIENT",
        resource_type="Patient",
        resource_id=str(patient.id),
        user_id=current_user.id,
        user_name=current_user.full_name,
        user_role=current_user.roles[0].name if current_user.roles else "Staff",
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"updated_fields": list(update_data.keys()), "hn": patient.hn},
    )

    return patient
