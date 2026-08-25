from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.brand import Brand
from app.infrastructure.db.session import get_db
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.services.base_service import CrudService


class BrandService(CrudService[Brand]):
    entity_name = "Brand"

    async def delete(self, entity_id: int) -> None:
        try:
            await super().delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: esta marca tiene productos asociados"
            ) from exc


def get_brand_service(session: AsyncSession = Depends(get_db)) -> BrandService:
    return BrandService(SqlAlchemyBrandRepository(session))
