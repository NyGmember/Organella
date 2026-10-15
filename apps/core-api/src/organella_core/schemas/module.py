import uuid
from datetime import datetime
from typing import Any, Dict

from pydantic import BaseModel, ConfigDict


class ModuleResponse(BaseModel):
    id: uuid.UUID
    module_id: str
    name: str
    version: str
    description: str
    author: str
    is_enabled: bool
    is_builtin: bool
    manifest: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ModuleRegisterRequest(BaseModel):
    manifest: Dict[str, Any]


class ModuleEnableRequest(BaseModel):
    enabled: bool
