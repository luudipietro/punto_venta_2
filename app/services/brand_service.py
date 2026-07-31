from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.brand import Brand
from app.infrastructure.db.session import get_db
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.services.base_service import CrudService


class BrandService(CrudService[Brand]):
    entity_name = "Brand"


def get_brand_service(session: AsyncSession = Depends(get_db)) -> BrandService:
    return BrandService(SqlAlchemyBrandRepository(session))
