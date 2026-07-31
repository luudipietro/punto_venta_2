from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.size import Size
from app.infrastructure.db.session import get_db
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.services.base_service import CrudService


class SizeService(CrudService[Size]):
    entity_name = "Size"


def get_size_service(session: AsyncSession = Depends(get_db)) -> SizeService:
    return SizeService(SqlAlchemySizeRepository(session))
