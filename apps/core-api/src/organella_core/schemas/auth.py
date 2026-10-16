import uuid
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PermissionResponse(BaseModel):
    id: uuid.UUID
    name: str
    group_name: str = "General"
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PermissionGroupCatalog(BaseModel):
    group_name: str
    permissions: List[PermissionResponse] = Field(default_factory=list)


class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    permissions: List[PermissionResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class RolePermissionsUpdate(BaseModel):
    permission_names: List[str] = Field(default_factory=list)


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: EmailStr
    full_name: str
    license_number: Optional[str] = None
    department: Optional[str] = None
    is_active: bool
    is_superuser: bool
    roles: List[RoleResponse] = Field(default_factory=list)
    direct_permissions: List[PermissionResponse] = Field(default_factory=list)
    permissions: List[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    license_number: Optional[str] = None
    department: Optional[str] = None
    role_names: List[str] = Field(default_factory=list)
    direct_permission_names: List[str] = Field(default_factory=list)


class UserPermissionsUpdate(BaseModel):
    role_names: Optional[List[str]] = None
    direct_permission_names: Optional[List[str]] = None
    license_number: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
