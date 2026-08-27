from fastapi import APIRouter, Depends, Request

from app.core.auth import get_current_user
from app.core.rate_limit import check_login_rate_limit, clear_login_failures, record_login_failure
from app.core.security import create_access_token
from app.domain.user import User
from app.schemas.auth_schema import LoginRequest, LoginResponse
from app.schemas.user_schema import UserRead
from app.services.user_service import UserService, get_user_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=LoginResponse)
async def login(
    request: Request,
    payload: LoginRequest,
    service: UserService = Depends(get_user_service),
) -> LoginResponse:
    check_login_rate_limit(request)
    try:
        user = await service.authenticate(payload.username, payload.password)
    except Exception:
        record_login_failure(request)
        raise
    clear_login_failures(request)
    token = create_access_token(
        subject=str(user.id), role=user.role.value, branch_id=user.branch_id
    )
    return LoginResponse(access_token=token, user=user)


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
