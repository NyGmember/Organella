import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from organella_core.models.module import CoreModule


class ModuleValidationError(Exception):
    pass


def validate_manifest(manifest_data: Dict[str, Any]) -> None:
    required_fields = ["id", "name", "version", "description", "permissions"]
    for field in required_fields:
        if field not in manifest_data:
            raise ModuleValidationError(f"Missing required manifest field: '{field}'")

    if not isinstance(manifest_data["permissions"], list):
        raise ModuleValidationError("'permissions' must be a list of permission strings")

    if "frontend" in manifest_data:
        frontend = manifest_data["frontend"]
        if "entry" not in frontend or "slots" not in frontend:
            raise ModuleValidationError(
                "Frontend manifest configuration must include 'entry' and 'slots'"
            )


async def register_or_update_module(
    db: AsyncSession,
    manifest: Dict[str, Any],
    is_builtin: bool = False,
) -> CoreModule:
    validate_manifest(manifest)
    module_id = manifest["id"]

    stmt = select(CoreModule).where(CoreModule.module_id == module_id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.name = manifest["name"]
        existing.version = manifest["version"]
        existing.description = manifest["description"]
        existing.author = manifest.get("author", "Unknown")
        existing.manifest = manifest
        existing.is_builtin = is_builtin
        await db.commit()
        await db.refresh(existing)
        return existing

    new_module = CoreModule(
        module_id=module_id,
        name=manifest["name"],
        version=manifest["version"],
        description=manifest["description"],
        author=manifest.get("author", "Unknown"),
        is_enabled=True,
        is_builtin=is_builtin,
        manifest=manifest,
    )
    db.add(new_module)
    await db.commit()
    await db.refresh(new_module)
    return new_module


async def scan_and_sync_local_modules(
    db: AsyncSession,
    modules_root_dir: Optional[Path] = None,
) -> List[CoreModule]:
    """
    Scans the repository's modules/ directory for module.json manifests and registers them.
    """
    if modules_root_dir is None:
        # Search current working directory and parent paths for 'modules' folder
        search_paths = [Path.cwd(), Path.cwd().parent, *Path(__file__).resolve().parents]
        for p in search_paths:
            cand = p / "modules"
            if cand.is_dir() and (cand / "doctor-opd").exists():
                modules_root_dir = cand
                break

        if modules_root_dir is None:
            modules_root_dir = Path.cwd() / "modules"

    synced_modules = []
    if not modules_root_dir.exists():
        return synced_modules

    for item in modules_root_dir.iterdir():
        if item.is_dir():
            manifest_file = item / "module.json"
            if not manifest_file.exists():
                manifest_file = item / "manifest.json"
            if manifest_file.exists():
                try:
                    with open(manifest_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    mod = await register_or_update_module(db, data, is_builtin=True)
                    synced_modules.append(mod)
                except Exception as e:
                    print(f"[Module Manager] Failed to load {manifest_file}: {e}")

    return synced_modules


async def get_all_modules(db: AsyncSession) -> List[CoreModule]:
    stmt = select(CoreModule).order_by(CoreModule.name.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_active_manifests(db: AsyncSession) -> List[Dict[str, Any]]:
    stmt = select(CoreModule).where(CoreModule.is_enabled.is_(True))
    result = await db.execute(stmt)
    modules = result.scalars().all()
    return [m.manifest for m in modules]


async def set_module_enabled(
    db: AsyncSession,
    module_id: str,
    enabled: bool,
) -> CoreModule:
    stmt = select(CoreModule).where(CoreModule.module_id == module_id)
    result = await db.execute(stmt)
    mod = result.scalar_one_or_none()
    if not mod:
        raise ValueError(f"Module '{module_id}' not found")
    mod.is_enabled = enabled
    await db.commit()
    await db.refresh(mod)
    return mod
