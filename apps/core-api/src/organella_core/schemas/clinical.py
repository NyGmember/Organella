import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class VitalSignsSchema(BaseModel):
    bp_systolic: Optional[int] = Field(default=120, description="Systolic Blood Pressure (mmHg)")
    bp_diastolic: Optional[int] = Field(default=80, description="Diastolic Blood Pressure (mmHg)")
    pulse: Optional[int] = Field(default=76, description="Heart Rate / Pulse (bpm)")
    temperature: Optional[float] = Field(default=36.8, description="Body Temperature (°C)")
    respiratory_rate: Optional[int] = Field(
        default=18, description="Respiratory Rate (breaths/min)"
    )
    spo2: Optional[int] = Field(default=98, description="Oxygen Saturation (%)")
    weight: Optional[float] = Field(default=65.0, description="Weight (kg)")
    height: Optional[float] = Field(default=170.0, description="Height (cm)")
    bmi: Optional[float] = Field(default=None, description="Body Mass Index (kg/m²)")
    pain_score: Optional[int] = Field(default=0, ge=0, le=10, description="Pain Score (0-10)")


class QueueCheckInCreate(BaseModel):
    patient_id: uuid.UUID
    department: str = Field(default="อายุรกรรมทั่วไป (OPD Med Rm.3)")
    priority: str = Field(default="routine")
    chief_complaint: Optional[str] = Field(default="มาตรวจตามนัด / ซักประวัติที่จุดคัดกรอง")


class QueueStatusUpdate(BaseModel):
    status: str = Field(..., description="arrived, triaged, in-progress, finished, cancelled")
    priority: Optional[str] = None
    department: Optional[str] = None


class SoapNoteSchema(BaseModel):
    subjective: str = Field(
        default="", description="Subjective symptoms and chief complaint history"
    )
    objective: str = Field(default="", description="Objective physical examination findings")
    assessment: str = Field(
        default="", description="Clinical assessment and differential diagnosis"
    )
    plan: str = Field(default="", description="Treatment and follow-up plan")


class ConditionCreate(BaseModel):
    icd10_code: str = Field(..., min_length=1, max_length=20)
    icd10_display: str = Field(..., min_length=1, max_length=255)
    clinical_status: str = Field(default="active")
    verification_status: str = Field(default="confirmed")
    diagnosis_type: str = Field(default="principal")
    notes: Optional[str] = None


class ConditionResponse(ConditionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    encounter_id: uuid.UUID
    patient_id: uuid.UUID
    created_at: datetime


class MedicationOrderCreate(BaseModel):
    medication_code: Optional[str] = Field(default=None, max_length=50)
    medication_name: str = Field(..., min_length=1, max_length=255)
    dosage_instruction: str = Field(..., min_length=1, max_length=255)
    quantity: int = Field(default=1, ge=1)
    unit: str = Field(default="tablet", max_length=50)
    status: str = Field(default="active")
    notes: Optional[str] = None


class MedicationOrderResponse(MedicationOrderCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    encounter_id: uuid.UUID
    patient_id: uuid.UUID
    created_at: datetime


class EncounterConsultationCreate(BaseModel):
    encounter_id: Optional[uuid.UUID] = None
    encounter_number: Optional[str] = None
    patient_id: uuid.UUID
    encounter_type: str = Field(default="OPD")
    status: str = Field(default="finished")
    priority: str = Field(default="routine")
    department: str = Field(default="General Medicine OPD")
    queue_number: Optional[str] = None
    chief_complaint: Optional[str] = None
    vital_signs: VitalSignsSchema = Field(default_factory=VitalSignsSchema)
    soap_note: SoapNoteSchema = Field(default_factory=SoapNoteSchema)
    conditions: List[ConditionCreate] = Field(default_factory=list)
    medications: List[MedicationOrderCreate] = Field(default_factory=list)


class EncounterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    encounter_number: str
    patient_id: uuid.UUID
    practitioner_id: Optional[uuid.UUID] = None
    encounter_type: str
    status: str
    priority: str
    department: str
    queue_number: Optional[str] = None
    chief_complaint: Optional[str] = None
    vital_signs: Dict[str, Any]
    soap_note: Dict[str, Any]
    started_at: datetime
    ended_at: Optional[datetime] = None
    conditions: List[ConditionResponse] = Field(default_factory=list)
    medications: List[MedicationOrderResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class QueueItemResponse(BaseModel):
    encounter_id: uuid.UUID
    encounter_number: str
    queue_number: str
    status: str
    priority: str
    department: str
    chief_complaint: Optional[str] = None
    started_at: datetime
    patient_id: uuid.UUID
    hn: str
    patient_name: str
    gender: str
    birth_date: str
    blood_group: Optional[str] = None
    allergies: List[str] = Field(default_factory=list)
    vital_signs: Dict[str, Any] = Field(default_factory=dict)
    soap_note: Dict[str, Any] = Field(default_factory=dict)
    conditions: List[ConditionResponse] = Field(default_factory=list)
    medications: List[MedicationOrderResponse] = Field(default_factory=list)


class ICD10CodeItem(BaseModel):
    code: str
    display: str
    category: str
