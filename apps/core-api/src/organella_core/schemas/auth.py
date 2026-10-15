import uuid
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class PermissionResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    permissions: List[PermissionResponse] = []

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: EmailStr
    full_name: str
    license_number: Optional[str] = None
    department: Optional[str] = None
    is_active: bool
    is_superuser: bool
    roles: List[RoleResponse] = []
    permissions: List[str] = []

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
    role_names: List[str] = []
