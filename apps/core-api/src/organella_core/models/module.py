from typing import Any, Dict

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from organella_core.database import Base
from organella_core.models.base import TimestampMixin, UUIDMixin


class CoreModule(Base, UUIDMixin, TimestampMixin):
    """
    Module Registry entity tracking installed and activated plugins.
    """

    __tablename__ = "core_modules"

    module_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    author: Mapped[str] = mapped_column(String(255), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Full JSON manifest (module.json)
    manifest: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
