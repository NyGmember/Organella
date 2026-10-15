from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy import Boolean, Date, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from organella_core.database import Base
from organella_core.models.base import TimestampMixin, UUIDMixin


class Patient(Base, UUIDMixin, TimestampMixin):
    """
    Master Patient Index (MPI) Entity.
    Single Source of Truth for patient demographics and identification.
    """

    __tablename__ = "mpi_patients"

    hn: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    citizen_id: Mapped[Optional[str]] = mapped_column(String(20), index=True, nullable=True)
    prefix: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    first_name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    gender: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # 'male', 'female', 'other', 'unknown'
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    blood_group: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Clinical & Contact Payloads stored in JSONB
    allergies: Mapped[List[str]] = mapped_column(JSONB, default=list, nullable=False)
    contact_info: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    address: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (Index("ix_mpi_patients_name", "first_name", "last_name"),)
