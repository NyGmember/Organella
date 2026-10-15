import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PatientBase(BaseModel):
    hn: str = Field(..., description="Hospital Number (unique)")
    citizen_id: Optional[str] = Field(None, description="13-digit Thai National ID or Passport")
    prefix: Optional[str] = Field(None, description="Title/Prefix (นาย, นาง, น.ส.)")
    first_name: str = Field(..., description="Given name")
    last_name: str = Field(..., description="Family name")
    gender: str = Field(..., description="male, female, other, unknown")
    birth_date: date = Field(..., description="Date of birth")
    blood_group: Optional[str] = Field(None, description="ABO/Rh Blood group (e.g. O+, B+)")
    allergies: List[str] = Field(default_factory=list, description="Known drug/food allergies")
    contact_info: Dict[str, Any] = Field(
        default_factory=dict, description="Phone numbers, emails, emergency contacts"
    )
    address: Dict[str, Any] = Field(
        default_factory=dict, description="Residential address components"
    )
    is_active: bool = True


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    citizen_id: Optional[str] = None
    prefix: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[date] = None
    blood_group: Optional[str] = None
    allergies: Optional[List[str]] = None
    contact_info: Optional[Dict[str, Any]] = None
    address: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class PatientResponse(PatientBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PatientListResponse(BaseModel):
    total: int
    items: List[PatientResponse]
