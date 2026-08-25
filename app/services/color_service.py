from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.color import Color
from app.infrastructure.db.session import get_db
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.services.base_service import CrudService


class ColorService(CrudService[Color]):
    entity_name = "Color"

    async def delete(self, entity_id: int) -> None:
        try:
            await super().delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: este color tiene stock asociado"
            ) from exc


def get_color_service(session: AsyncSession = Depends(get_db)) -> ColorService:
    return ColorService(SqlAlchemyColorRepository(session))
