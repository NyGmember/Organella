from typing import List, Optional

from sqlalchemy import Boolean, Column, ForeignKey, String, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from organella_core.database import Base
from organella_core.models.base import TimestampMixin, UUIDMixin

# Association table between Users and Roles
user_roles = Table(
    "auth_user_roles",
    Base.metadata,
    Column(
        "user_id",
        UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "role_id",
        UUID(as_uuid=True),
        ForeignKey("auth_roles.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# Association table between Roles and Permissions
role_permissions = Table(
    "auth_role_permissions",
    Base.metadata,
    Column(
        "role_id",
        UUID(as_uuid=True),
        ForeignKey("auth_roles.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "permission_id",
        UUID(as_uuid=True),
        ForeignKey("auth_permissions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Permission(Base, UUIDMixin):
    """Granular permission scope (e.g., 'patient:read', 'encounter:write')"""

    __tablename__ = "auth_permissions"

    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    roles: Mapped[List["Role"]] = relationship(
        "Role",
        secondary=role_permissions,
        back_populates="permissions",
    )


class Role(Base, UUIDMixin, TimestampMixin):
    """User role (e.g., 'Doctor', 'Nurse', 'Pharmacist', 'Admin')"""

    __tablename__ = "auth_roles"

    name: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    users: Mapped[List["User"]] = relationship(
        "User",
        secondary=user_roles,
        back_populates="roles",
    )
    permissions: Mapped[List[Permission]] = relationship(
        Permission,
        secondary=role_permissions,
        back_populates="roles",
        lazy="selectin",
    )


class User(Base, UUIDMixin, TimestampMixin):
    """Healthcare provider or administrative staff user"""

    __tablename__ = "auth_users"

    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    license_number: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )  # ใบประกอบวิชาชีพเวชกรรม/พยาบาล
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    roles: Mapped[List[Role]] = relationship(
        Role,
        secondary=user_roles,
        back_populates="users",
        lazy="selectin",
    )
