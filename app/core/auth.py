import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import PermissionDeniedError
from app.core.security import decode_access_token
from app.domain.user import User, UserRole
from app.services.user_service import UserService, get_user_service

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_service: UserService = Depends(get_user_service),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado")
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado") from exc
    return await user_service.get_by_id(int(payload["sub"]))


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise PermissionDeniedError("Esta acción requiere permisos de administrador")
    return current_user


def acting_branch_id_of(user: User) -> int | None:
    """None means "no branch restriction" (admin) — passed straight through
    to service methods' `acting_branch_id` parameter."""
    return user.branch_id if user.role == UserRole.EMPLEADO else None
