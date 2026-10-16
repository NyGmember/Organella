import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ICD10MasterCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    display_en: str = Field(..., min_length=1, max_length=255)
    display_th: Optional[str] = Field(default=None, max_length=255)
    category: str = Field(default="General", max_length=100)
    is_active: bool = True


class ICD10MasterResponse(ICD10MasterCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display: str
    created_at: datetime


class ICD10BulkImportRequest(BaseModel):
    items: Optional[List[ICD10MasterCreate]] = None
    csv_text: Optional[str] = Field(
        default=None,
        description="CSV with header: code,display_en,display_th,category",
    )


class MedicationMasterCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    generic_name: str = Field(..., min_length=1, max_length=255)
    trade_name: Optional[str] = Field(default=None, max_length=255)
    strength: Optional[str] = Field(default=None, max_length=100)
    dosage_form: str = Field(default="tablet", max_length=50)
    default_dosage: str = Field(default="รับประทานครั้งละ 1 เม็ด หลังอาหาร")
    unit: str = Field(default="tablet", max_length=50)
    drug_allergy_class: Optional[str] = Field(default=None, max_length=100)
    is_active: bool = True


class MedicationMasterResponse(MedicationMasterCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    created_at: datetime


class MedicationBulkImportRequest(BaseModel):
    items: Optional[List[MedicationMasterCreate]] = None
    csv_text: Optional[str] = Field(
        default=None,
        description="CSV with header: code,generic_name,strength,dosage_form,default_dosage,unit,drug_allergy_class",
    )


class PatientImportItem(BaseModel):
    hn: str
    citizen_id: Optional[str] = None
    prefix: Optional[str] = "คุณ"
    first_name: str
    last_name: str
    gender: str = "unknown"
    birth_date: date = date(1985, 1, 1)
    blood_group: Optional[str] = "O+"
    allergies: List[str] = Field(default_factory=list)


class PatientBulkImportRequest(BaseModel):
    items: Optional[List[PatientImportItem]] = None
    csv_text: Optional[str] = Field(
        default=None,
        description="CSV with header: hn,citizen_id,prefix,first_name,last_name,gender,birth_date,blood_group,allergies",
    )


class BulkImportResult(BaseModel):
    resource_type: str
    imported_count: int
    updated_count: int
    total_processed: int


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    module_id: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
