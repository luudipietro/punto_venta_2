from abc import ABC, abstractmethod

from app.domain.size import Size
from app.infrastructure.db.models.size_model import SizeModel
from app.repositories.base_repository import SqlAlchemyRepository


class SizeRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[Size]: ...

    @abstractmethod
    async def get_by_id(self, size_id: int) -> Size | None: ...

    @abstractmethod
    async def create(self, size: Size) -> Size: ...

    @abstractmethod
    async def update(self, size: Size) -> Size: ...

    @abstractmethod
    async def delete(self, size_id: int) -> None: ...


class SqlAlchemySizeRepository(SqlAlchemyRepository[SizeModel], SizeRepository):
    model = SizeModel

    async def list_all(self) -> list[Size]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, size_id: int) -> Size | None:
        model = await self._get_model(size_id)
        return self._to_domain(model) if model else None

    async def create(self, size: Size) -> Size:
        model = SizeModel(label=size.label)
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, size: Size) -> Size:
        model = await self._get_model(size.id)
        model.label = size.label
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, size_id: int) -> None:
        model = await self._get_model(size_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: SizeModel) -> Size:
        return Size(id=model.id, label=model.label)
