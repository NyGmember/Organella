from typing import Annotated, Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from organella_core.database import get_db
from organella_core.models.auth import User
from organella_core.schemas.module import ModuleEnableRequest, ModuleResponse
from organella_core.security import require_permission
from organella_core.services.module_manager import (
    get_active_manifests,
    get_all_modules,
    scan_and_sync_local_modules,
    set_module_enabled,
)

router = APIRouter(prefix="/modules", tags=["Module App Store & Registry"])


@router.get("", response_model=List[ModuleResponse])
async def list_modules(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Retrieve catalog of all installed modules and their status"""
    return await get_all_modules(db)


@router.get("/active-manifests", response_model=List[Dict[str, Any]])
async def get_active_module_manifests(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Returns frontend configurations and slot mounting specifications
    for all currently activated modules.
    Used by the Frontend Host Shell to dynamically mount remote components.
    """
    return await get_active_manifests(db)


@router.post("/sync", response_model=List[ModuleResponse])
async def sync_modules(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("admin:modules"))],
):
    """Scan local filesystem modules directory and register/update manifests"""
    synced = await scan_and_sync_local_modules(db)
    return synced


@router.post("/{module_id}/toggle", response_model=ModuleResponse)
async def toggle_module(
    module_id: str,
    payload: ModuleEnableRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("admin:modules"))],
):
    """Activate or deactivate a module"""
    try:
        mod = await set_module_enabled(db, module_id, payload.enabled)
        return mod
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
