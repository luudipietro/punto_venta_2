from fastapi import APIRouter, Depends, status

from app.core.auth import require_admin
from app.domain.category import Category
from app.schemas.category_schema import CategoryCreate, CategoryRead
from app.services.category_service import CategoryService, get_category_service

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("", response_model=list[CategoryRead])
async def list_categories(
    service: CategoryService = Depends(get_category_service),
) -> list[Category]:
    return await service.list_all()


@router.get("/{category_id}", response_model=CategoryRead)
async def get_category(
    category_id: int, service: CategoryService = Depends(get_category_service)
) -> Category:
    return await service.get_by_id(category_id)


@router.post(
    "",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_category(
    payload: CategoryCreate, service: CategoryService = Depends(get_category_service)
) -> Category:
    return await service.create(Category(**payload.model_dump()))


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_category(
    category_id: int, service: CategoryService = Depends(get_category_service)
) -> None:
    await service.delete(category_id)
