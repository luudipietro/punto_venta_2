from typing import Generic, Protocol, TypeVar

from app.core.exceptions import EntityNotFoundError

DomainT = TypeVar("DomainT")


class CrudRepositoryProtocol(Protocol[DomainT]):
    async def list_all(self) -> list[DomainT]: ...

    async def get_by_id(self, entity_id: int) -> DomainT | None: ...

    async def create(self, entity: DomainT) -> DomainT: ...

    async def update(self, entity: DomainT) -> DomainT: ...

    async def delete(self, entity_id: int) -> None: ...


class CrudService(Generic[DomainT]):
    """Business logic shared by the simple catalog entities: existence
    checks around an otherwise pass-through repository. Entities with real
    business rules (e.g. Sale) do not use this base class."""

    entity_name: str

    def __init__(self, repository: CrudRepositoryProtocol[DomainT]) -> None:
        self._repository = repository

    async def list_all(self) -> list[DomainT]:
        return await self._repository.list_all()

    async def get_by_id(self, entity_id: int) -> DomainT:
        entity = await self._repository.get_by_id(entity_id)
        if entity is None:
            raise EntityNotFoundError(self.entity_name, entity_id)
        return entity

    async def create(self, entity: DomainT) -> DomainT:
        return await self._repository.create(entity)

    async def update(self, entity_id: int, entity: DomainT) -> DomainT:
        await self.get_by_id(entity_id)
        entity.id = entity_id  # type: ignore[attr-defined]
        return await self._repository.update(entity)

    async def delete(self, entity_id: int) -> None:
        await self.get_by_id(entity_id)
        await self._repository.delete(entity_id)
