from abc import ABC, abstractmethod

from app.domain.color import Color
from app.infrastructure.db.models.color_model import ColorModel
from app.repositories.base_repository import SqlAlchemyRepository


class ColorRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[Color]: ...

    @abstractmethod
    async def get_by_id(self, color_id: int) -> Color | None: ...

    @abstractmethod
    async def create(self, color: Color) -> Color: ...

    @abstractmethod
    async def update(self, color: Color) -> Color: ...

    @abstractmethod
    async def delete(self, color_id: int) -> None: ...


class SqlAlchemyColorRepository(SqlAlchemyRepository[ColorModel], ColorRepository):
    model = ColorModel

    async def list_all(self) -> list[Color]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, color_id: int) -> Color | None:
        model = await self._get_model(color_id)
        return self._to_domain(model) if model else None

    async def create(self, color: Color) -> Color:
        model = ColorModel(name=color.name, hex_code=color.hex_code)
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, color: Color) -> Color:
        model = await self._get_model(color.id)
        model.name = color.name
        model.hex_code = color.hex_code
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, color_id: int) -> None:
        model = await self._get_model(color_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: ColorModel) -> Color:
        return Color(id=model.id, name=model.name, hex_code=model.hex_code)
