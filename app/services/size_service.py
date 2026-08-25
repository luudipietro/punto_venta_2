from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.size import Size
from app.infrastructure.db.session import get_db
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.services.base_service import CrudService


class SizeService(CrudService[Size]):
    entity_name = "Size"

    async def delete(self, entity_id: int) -> None:
        try:
            await super().delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: este talle tiene stock asociado"
            ) from exc


def get_size_service(session: AsyncSession = Depends(get_db)) -> SizeService:
    return SizeService(SqlAlchemySizeRepository(session))
