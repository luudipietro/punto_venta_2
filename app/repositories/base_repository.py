from typing import Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

ModelT = TypeVar("ModelT")


class SqlAlchemyRepository(Generic[ModelT]):
    """Generic persistence helpers shared by the simple, single-table
    repositories. Subclasses set `model` and add the domain<->model mapping
    plus any query specific to that entity."""

    model: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _get_model(self, entity_id: int) -> ModelT | None:
        return await self._session.get(self.model, entity_id)

    async def _list_models(self) -> list[ModelT]:
        result = await self._session.execute(select(self.model))
        return list(result.scalars().all())

    async def _delete_model(self, instance: ModelT) -> None:
        await self._session.delete(instance)
        await self._session.flush()
