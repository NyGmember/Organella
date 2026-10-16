import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from organella_core.database import Base
from organella_core.models.base import TimestampMixin, UUIDMixin


class Encounter(Base, UUIDMixin, TimestampMixin):
    """
    Clinical Encounter (OPD / IPD / ER Visit)
    Maps directly to HL7 FHIR R4 Encounter resource.
    """

    __tablename__ = "opd_encounters"

    encounter_number: Mapped[str] = mapped_column(
        String(30), unique=True, index=True, nullable=False
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mpi_patients.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    practitioner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    encounter_type: Mapped[str] = mapped_column(
        String(20), default="OPD", nullable=False
    )  # OPD, IPD, ER
    status: Mapped[str] = mapped_column(
        String(30), default="in-progress", index=True, nullable=False
    )  # planned, arrived, triaged, in-progress, finished, cancelled
    priority: Mapped[str] = mapped_column(
        String(20), default="routine", nullable=False
    )  # routine, urgent, stat
    department: Mapped[str] = mapped_column(
        String(100), default="General Medicine OPD", nullable=False
    )
    queue_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    chief_complaint: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Structured Clinical Payloads (JSONB)
    vital_signs: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    soap_note: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    conditions: Mapped[List["Condition"]] = relationship(
        "Condition", back_populates="encounter", cascade="all, delete-orphan", lazy="selectin"
    )
    medications: Mapped[List["MedicationOrder"]] = relationship(
        "MedicationOrder", back_populates="encounter", cascade="all, delete-orphan", lazy="selectin"
    )
    lab_orders: Mapped[List["LabOrder"]] = relationship(
        "LabOrder", back_populates="encounter", cascade="all, delete-orphan", lazy="selectin"
    )


class Condition(Base, UUIDMixin, TimestampMixin):
    """
    Clinical Diagnosis / Problem List (ICD-10 / SNOMED CT)
    Maps directly to HL7 FHIR R4 Condition resource.
    """

    __tablename__ = "opd_conditions"

    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("opd_encounters.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mpi_patients.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    icd10_code: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    icd10_display: Mapped[str] = mapped_column(String(255), nullable=False)
    clinical_status: Mapped[str] = mapped_column(
        String(30), default="active", nullable=False
    )  # active, recurrence, relapse, inactive, remission, resolved
    verification_status: Mapped[str] = mapped_column(
        String(30), default="confirmed", nullable=False
    )  # unconfirmed, provisional, differential, confirmed
    diagnosis_type: Mapped[str] = mapped_column(
        String(30), default="principal", nullable=False
    )  # principal, comorbidity, complication
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    encounter: Mapped["Encounter"] = relationship("Encounter", back_populates="conditions")


class MedicationOrder(Base, UUIDMixin, TimestampMixin):
    """
    Outpatient Medication Prescription Order
    Maps directly to HL7 FHIR R4 MedicationRequest resource.
    """

    __tablename__ = "opd_medications"

    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("opd_encounters.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mpi_patients.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    medication_code: Mapped[Optional[str]] = mapped_column(
        String(50), index=True, nullable=True
    )  # RxNorm / TMT Code
    medication_name: Mapped[str] = mapped_column(String(255), nullable=False)
    dosage_instruction: Mapped[str] = mapped_column(
        String(255), nullable=False
    )  # e.g., "1 tab PO tid pc"
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit: Mapped[str] = mapped_column(String(50), default="tablet", nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default="active", nullable=False
    )  # active, on-hold, cancelled, completed, dispensed
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    encounter: Mapped["Encounter"] = relationship("Encounter", back_populates="medications")


class LabOrder(Base, UUIDMixin, TimestampMixin):
    """
    Outpatient Laboratory & Diagnostic Order & Result (LIS)
    Maps directly to HL7 FHIR R4 Observation (laboratory) and DiagnosticReport resources.
    """

    __tablename__ = "opd_lab_orders"

    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("opd_encounters.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mpi_patients.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    lab_code: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    loinc_code: Mapped[Optional[str]] = mapped_column(String(30), index=True, nullable=True)
    test_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), default="Clinical Chemistry", nullable=False)
    specimen_type: Mapped[str] = mapped_column(
        String(100), default="Serum / Plasma", nullable=False
    )
    priority: Mapped[str] = mapped_column(
        String(20), default="routine", nullable=False
    )  # routine, urgent, stat
    status: Mapped[str] = mapped_column(
        String(30), default="ordered", index=True, nullable=False
    )  # ordered, collected, completed, cancelled
    result_value: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    reference_range: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    abnormal_flag: Mapped[str] = mapped_column(
        String(30), default="pending", nullable=False
    )  # pending, normal, high, low, critical
    ordered_by_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reported_by_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reported_by_license: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    clinical_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    encounter: Mapped["Encounter"] = relationship("Encounter", back_populates="lab_orders")
