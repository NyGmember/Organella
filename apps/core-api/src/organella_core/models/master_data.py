from typing import Optional

from sqlalchemy import Boolean, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from organella_core.database import Base
from organella_core.models.base import TimestampMixin, UUIDMixin


class MasterICD10(Base, UUIDMixin, TimestampMixin):
    """
    Master Data Table for ICD-10-TM / WHO Disease Classification Codes.
    Supports CRUD management and bulk CSV/JSON import.
    """

    __tablename__ = "master_icd10_codes"

    code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    display_en: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    display_th: Mapped[Optional[str]] = mapped_column(String(255), index=True, nullable=True)
    category: Mapped[str] = mapped_column(
        String(100), default="General", index=True, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    @property
    def display(self) -> str:
        if self.display_th:
            return f"{self.display_en} ({self.display_th})"
        return self.display_en


class MasterMedication(Base, UUIDMixin, TimestampMixin):
    """
    Master Data Table for Hospital Drug Formulary (TMT / RxNorm).
    Supports CRUD management, allergy cross-checking, and bulk CSV/JSON import.
    """

    __tablename__ = "master_medications"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    generic_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    trade_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    strength: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    dosage_form: Mapped[str] = mapped_column(String(50), default="tablet", nullable=False)
    default_dosage: Mapped[str] = mapped_column(Text, default="", nullable=False)
    unit: Mapped[str] = mapped_column(String(50), default="tablet", nullable=False)
    drug_allergy_class: Mapped[Optional[str]] = mapped_column(
        String(100), index=True, nullable=True
    )  # e.g., "Penicillin", "NSAIDs", "Sulfa"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    @property
    def display_name(self) -> str:
        parts = [self.generic_name]
        if self.strength:
            parts.append(self.strength)
        if self.dosage_form:
            parts.append(self.dosage_form.capitalize())
        return " ".join(parts)


class MasterLabTest(Base, UUIDMixin, TimestampMixin):
    """
    Master Data Table for Laboratory & Diagnostic Test Catalog (LOINC & Local Lab Codes).
    Supports CRUD management, reference range checking, and bulk CSV/JSON import.
    """

    __tablename__ = "master_lab_tests"

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    loinc_code: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    test_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    category: Mapped[str] = mapped_column(
        String(100), default="Clinical Chemistry", index=True, nullable=False
    )
    specimen_type: Mapped[str] = mapped_column(
        String(100), default="Serum / Plasma", nullable=False
    )
    unit: Mapped[str] = mapped_column(String(50), default="mg/dL", nullable=False)
    reference_range: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    ref_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ref_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
