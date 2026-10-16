import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Dict, List, Optional, Sequence, Union

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from organella_core.config import settings
from organella_core.database import get_db
from organella_core.models.auth import Role, User

# OAuth2 Scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# Password hashing using bcrypt directly
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.access_token_expire_minutes
        )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)
    return encoded_jwt


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="กรุณาเข้าสู่ระบบก่อนใช้งาน (Could not validate credentials)",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        user_id_str: Optional[str] = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception

    result = await db.execute(
        select(User)
        .where(User.id == user_id, User.is_active.is_(True))
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.direct_permissions),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


def require_permissions(required: Union[str, Sequence[str]]):
    """
    Dependency factory that verifies the authenticated user possesses ALL required
    granular permissions/roles in the required list.
    - NEVER checks by Group name (e.g., never checks 'Admin' or 'Doctor' group title).
    - NEVER bypasses clinical permissions via is_superuser.
    - Explicitly reports all missing permissions in the 403 error response.
    """
    if isinstance(required, str):
        required_list: List[str] = [required]
    else:
        required_list = list(required)

    async def permission_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        user_permissions = current_user.get_effective_permissions()
        missing = [perm for perm in required_list if perm not in user_permissions]

        if missing:
            missing_str = ", ".join(missing)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": f"ปฏิเสธการเข้าถึง (Access Denied): ขาดสิทธิ์ที่จำเป็น [{missing_str}]",
                    "required_roles": required_list,
                    "missing_roles": missing,
                    "user_roles": sorted(user_permissions),
                },
            )
        return current_user

    return permission_checker


# Alias for backward compatibility
require_permission = require_permissions
