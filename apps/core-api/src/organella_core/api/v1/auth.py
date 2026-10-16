import uuid
from collections import defaultdict
from typing import Annotated, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from organella_core.database import get_db
from organella_core.models.auth import Permission, Role, User
from organella_core.schemas.auth import (
    PermissionGroupCatalog,
    PermissionResponse,
    RolePermissionsUpdate,
    RoleResponse,
    TokenResponse,
    UserCreate,
    UserPermissionsUpdate,
    UserResponse,
)
from organella_core.security import (
    create_access_token,
    get_current_user,
    get_password_hash,
    require_permissions,
    verify_password,
)
from organella_core.services.audit import log_audit_event

router = APIRouter(prefix="/auth", tags=["Authentication & Granular RBAC"])


def build_user_response(user: User) -> UserResponse:
    permissions = sorted(user.get_effective_permissions())

    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        license_number=user.license_number,
        department=user.department,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        roles=user.roles,
        direct_permissions=user.direct_permissions,
        permissions=permissions,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """OAuth2 compatible token login, get an access token with granular effective permissions"""
    result = await db.execute(
        select(User)
        .where(User.username == form_data.username)
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.direct_permissions),
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง (Incorrect username or password)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="บัญชีผู้ใช้งานถูกระงับ (Inactive user account)",
        )

    access_token = create_access_token(data={"sub": str(user.id), "username": user.username})
    user_resp = build_user_response(user)

    return TokenResponse(access_token=access_token, token_type="bearer", user=user_resp)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]):
    """Retrieve details, assigned role groups, direct permissions, and effective permissions"""
    return build_user_response(current_user)


@router.get("/permissions/grouped", response_model=List[PermissionGroupCatalog])
async def list_grouped_permissions(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Returns all granular permissions organized by Group so the UI can select
    an entire Group at once or toggle individual permissions.
    """
    result = await db.execute(
        select(Permission).order_by(Permission.group_name.asc(), Permission.name.asc())
    )
    perms = list(result.scalars().all())

    grouped: Dict[str, List[PermissionResponse]] = defaultdict(list)
    for p in perms:
        grouped[p.group_name].append(PermissionResponse.model_validate(p))

    return [
        PermissionGroupCatalog(group_name=grp, permissions=items) for grp, items in grouped.items()
    ]


@router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all Role Groups and their included granular permissions"""
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).order_by(Role.name.asc())
    )
    return list(result.scalars().all())


@router.put("/roles/{role_name}/permissions", response_model=RoleResponse)
async def update_role_permissions(
    role_name: str,
    payload: RolePermissionsUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["admin:roles"]))],
):
    """Update the granular permissions inside a Role Group (Requires 'admin:roles')"""
    res = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.name == role_name)
    )
    role = res.scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role '{role_name}' not found",
        )

    perms_res = await db.execute(
        select(Permission).where(Permission.name.in_(payload.permission_names))
    )
    role.permissions = list(perms_res.scalars().all())
    await db.commit()
    await db.refresh(role)

    await log_audit_event(
        db=db,
        action="UPDATE_ROLE_PERMISSIONS",
        resource_type="Role",
        resource_id=role.name,
        user_id=current_user.id,
        user_name=current_user.username,
        client_ip=request.client.host if request.client else None,
        details={"role": role.name, "permissions": payload.permission_names},
    )
    return role


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _current_user: Annotated[User, Depends(require_permissions(["admin:users"]))],
):
    """List all system users with their assigned Role Groups and Direct Permissions (Requires 'admin:users')"""
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.direct_permissions),
        )
        .order_by(User.username.asc())
    )
    users = list(result.scalars().all())
    return [build_user_response(u) for u in users]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["admin:users"]))],
):
    """Create a new user account with multiple Role Groups and/or Direct Granular Permissions"""
    existing = await db.execute(
        select(User).where((User.username == payload.username) | (User.email == payload.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered",
        )

    roles: List[Role] = []
    if payload.role_names:
        roles_result = await db.execute(
            select(Role)
            .where(Role.name.in_(payload.role_names))
            .options(selectinload(Role.permissions))
        )
        roles = list(roles_result.scalars().all())

    direct_perms: List[Permission] = []
    if payload.direct_permission_names:
        perms_result = await db.execute(
            select(Permission).where(Permission.name.in_(payload.direct_permission_names))
        )
        direct_perms = list(perms_result.scalars().all())

    new_user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        license_number=payload.license_number,
        department=payload.department,
        roles=roles,
        direct_permissions=direct_perms,
    )

    db.add(new_user)
    await db.commit()

    reload_res = await db.execute(
        select(User)
        .where(User.id == new_user.id)
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.direct_permissions),
        )
    )
    new_user = reload_res.scalar_one()

    await log_audit_event(
        db=db,
        action="CREATE_USER",
        resource_type="User",
        resource_id=str(new_user.id),
        user_id=current_user.id,
        user_name=current_user.username,
        client_ip=request.client.host if request.client else None,
        details={
            "username": new_user.username,
            "roles": payload.role_names,
            "direct_permissions": payload.direct_permission_names,
        },
    )

    return build_user_response(new_user)


@router.put("/users/{user_id}/permissions", response_model=UserResponse)
async def update_user_permissions(
    user_id: uuid.UUID,
    payload: UserPermissionsUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permissions(["admin:users"]))],
):
    """
    Update a user's Role Groups and Direct Individual Permissions.
    Allows assigning multiple groups OR picking individual permissions across groups.
    """
    res = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.direct_permissions),
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found",
        )

    if payload.role_names is not None:
        if payload.role_names:
            roles_res = await db.execute(
                select(Role)
                .where(Role.name.in_(payload.role_names))
                .options(selectinload(Role.permissions))
            )
            user.roles = list(roles_res.scalars().all())
        else:
            user.roles = []

    if payload.direct_permission_names is not None:
        if payload.direct_permission_names:
            perms_res = await db.execute(
                select(Permission).where(Permission.name.in_(payload.direct_permission_names))
            )
            user.direct_permissions = list(perms_res.scalars().all())
        else:
            user.direct_permissions = []

    if payload.license_number is not None:
        user.license_number = payload.license_number
    if payload.department is not None:
        user.department = payload.department
    if payload.is_active is not None:
        user.is_active = payload.is_active

    await db.commit()

    reload_res = await db.execute(
        select(User)
        .where(User.id == user.id)
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.direct_permissions),
        )
    )
    user = reload_res.scalar_one()

    await log_audit_event(
        db=db,
        action="UPDATE_USER_PERMISSIONS",
        resource_type="User",
        resource_id=str(user.id),
        user_id=current_user.id,
        user_name=current_user.username,
        client_ip=request.client.host if request.client else None,
        details={
            "target_username": user.username,
            "roles": [r.name for r in user.roles],
            "direct_permissions": [p.name for p in user.direct_permissions],
            "effective_permissions": sorted(user.get_effective_permissions()),
        },
    )

    return build_user_response(user)
