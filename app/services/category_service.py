from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.category import Category
from app.infrastructure.db.session import get_db
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.services.base_service import CrudService


class CategoryService(CrudService[Category]):
    entity_name = "Category"

    async def delete(self, entity_id: int) -> None:
        try:
            await super().delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: esta categoría tiene productos asociados"
            ) from exc


def get_category_service(session: AsyncSession = Depends(get_db)) -> CategoryService:
    return CategoryService(SqlAlchemyCategoryRepository(session))
