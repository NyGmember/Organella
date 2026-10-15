import uuid
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from organella_core.models.audit import AuditLog


async def log_audit_event(
    db: AsyncSession,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    user_id: Optional[uuid.UUID] = None,
    user_name: Optional[str] = None,
    user_role: Optional[str] = None,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    module_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    """
    Creates an append-only audit log entry for regulatory compliance (PDPA / HIPAA).
    """
    log_entry = AuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user_id,
        user_name=user_name,
        user_role=user_role,
        client_ip=client_ip,
        user_agent=user_agent,
        module_id=module_id,
        details=details or {},
    )
    db.add(log_entry)
    await db.commit()
    return log_entry
