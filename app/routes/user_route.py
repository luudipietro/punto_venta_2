from fastapi import APIRouter, Depends, status

from app.core.auth import require_admin
from app.domain.user import User
from app.schemas.user_schema import UserCreate, UserRead, UserUpdate
from app.services.user_service import UserService, get_user_service

router = APIRouter(prefix="/users", tags=["Users"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[UserRead])
async def list_users(service: UserService = Depends(get_user_service)) -> list[User]:
    return await service.list_all()


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: int, service: UserService = Depends(get_user_service)) -> User:
    return await service.get_by_id(user_id)


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate, service: UserService = Depends(get_user_service)
) -> User:
    return await service.create(payload.username, payload.password, payload.role, payload.branch_id)


@router.put("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int, payload: UserUpdate, service: UserService = Depends(get_user_service)
) -> User:
    return await service.update(
        user_id, payload.username, payload.role, payload.branch_id, payload.password
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, service: UserService = Depends(get_user_service)) -> None:
    await service.delete(user_id)
