from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from organella_core.database import get_db
from organella_core.models.auth import Role, User
from organella_core.schemas.auth import TokenResponse, UserCreate, UserResponse
from organella_core.security import (
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication & RBAC"])


def build_user_response(user: User) -> UserResponse:
    permissions: List[str] = []
    for role in user.roles:
        for perm in role.permissions:
            if perm.name not in permissions:
                permissions.append(perm.name)

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
        permissions=permissions,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """OAuth2 compatible token login, get an access token for future requests"""
    result = await db.execute(
        select(User)
        .where(User.username == form_data.username)
        .options(selectinload(User.roles).selectinload(Role.permissions))
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account",
        )

    access_token = create_access_token(data={"sub": str(user.id), "username": user.username})
    user_resp = build_user_response(user)

    return TokenResponse(access_token=access_token, token_type="bearer", user=user_resp)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]):
    """Retrieve details and active permissions of the currently authenticated user"""
    return build_user_response(current_user)


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Create a new user account (Requires superuser privileges)"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can create user accounts",
        )

    # Check unique username and email
    existing = await db.execute(
        select(User).where((User.username == payload.username) | (User.email == payload.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered",
        )

    # Resolve roles
    roles: List[Role] = []
    if payload.role_names:
        roles_result = await db.execute(
            select(Role)
            .where(Role.name.in_(payload.role_names))
            .options(selectinload(Role.permissions))
        )
        roles = list(roles_result.scalars().all())

    new_user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        license_number=payload.license_number,
        department=payload.department,
        roles=roles,
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return build_user_response(new_user)
