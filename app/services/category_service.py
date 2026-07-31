from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.category import Category
from app.infrastructure.db.session import get_db
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.services.base_service import CrudService


class CategoryService(CrudService[Category]):
    entity_name = "Category"


def get_category_service(session: AsyncSession = Depends(get_db)) -> CategoryService:
    return CategoryService(SqlAlchemyCategoryRepository(session))
