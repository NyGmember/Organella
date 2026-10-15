import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from organella_core.config import settings
from organella_core.database import get_db
from organella_core.models.patient import Patient
from organella_core.services.fhir_adapter import (
    create_patient_bundle,
    patient_to_fhir,
)

router = APIRouter(prefix="/fhir/r4", tags=["HL7 FHIR R4 Interoperability Gateway"])


@router.get("/Patient/{patient_id}")
async def get_fhir_patient(
    patient_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Retrieve an HL7 FHIR R4 Patient Resource by UUID or Hospital Number (HN)"""
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
            detail=f"FHIR Patient '{patient_id}' not found",
        )

    fhir_resource = patient_to_fhir(patient)
    return Response(
        content=fhir_resource.model_dump_json(),
        media_type="application/fhir+json",
    )


@router.get("/Patient")
async def search_fhir_patients(
    db: Annotated[AsyncSession, Depends(get_db)],
    identifier: Optional[str] = Query(None, description="Search by identifier (HN or Citizen ID)"),
    name: Optional[str] = Query(None, description="Search by name (Given or Family)"),
    gender: Optional[str] = Query(None, description="male | female | other | unknown"),
    _count: int = Query(50, ge=1, le=100),
    _offset: int = Query(0, ge=0),
):
    """Search HL7 FHIR R4 Patient Resources and return a searchset Bundle"""
    stmt = select(Patient).where(Patient.is_active.is_(True))

    if identifier:
        stmt = stmt.where(or_(Patient.hn == identifier, Patient.citizen_id == identifier))

    if name:
        stmt = stmt.where(
            or_(
                Patient.first_name.ilike(f"%{name}%"),
                Patient.last_name.ilike(f"%{name}%"),
            )
        )

    if gender:
        stmt = stmt.where(Patient.gender == gender.lower())

    # Count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Results
    stmt = stmt.order_by(Patient.hn.asc()).limit(_count).offset(_offset)
    result = await db.execute(stmt)
    patients = list(result.scalars().all())

    bundle = create_patient_bundle(
        patients=patients,
        base_url=settings.fhir_base_url,
        total=total,
    )

    return Response(
        content=bundle.model_dump_json(),
        media_type="application/fhir+json",
    )


@router.get("/metadata")
async def get_capability_statement():
    """HL7 FHIR R4 CapabilityStatement (Conformance metadata)"""
    return {
        "resourceType": "CapabilityStatement",
        "status": "active",
        "date": "2026-10-15T00:00:00Z",
        "publisher": "Organella Health Community",
        "kind": "instance",
        "software": {
            "name": "Organella Generic Health Engine",
            "version": "0.1.0",
        },
        "implementation": {
            "description": "Organella Hybrid FHIR R4 Interoperability Gateway",
            "url": settings.fhir_base_url,
        },
        "fhirVersion": "4.0.1",
        "format": ["application/json", "application/fhir+json"],
        "rest": [
            {
                "mode": "server",
                "resource": [
                    {
                        "type": "Patient",
                        "interaction": [
                            {"code": "read"},
                            {"code": "search-type"},
                        ],
                        "searchParam": [
                            {"name": "identifier", "type": "token"},
                            {"name": "name", "type": "string"},
                            {"name": "gender", "type": "token"},
                        ],
                    }
                ],
            }
        ],
    }
