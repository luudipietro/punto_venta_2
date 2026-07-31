from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.color import Color
from app.infrastructure.db.session import get_db
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.services.base_service import CrudService


class ColorService(CrudService[Color]):
    entity_name = "Color"


def get_color_service(session: AsyncSession = Depends(get_db)) -> ColorService:
    return ColorService(SqlAlchemyColorRepository(session))
