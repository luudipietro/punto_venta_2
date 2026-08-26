from typing import TYPE_CHECKING, Generic, Protocol, TypeVar

from app.core.exceptions import EntityNotFoundError

if TYPE_CHECKING:
    from app.domain.user import User
    from app.services.audit_log_service import AuditLogService

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

    def __init__(
        self,
        repository: CrudRepositoryProtocol[DomainT],
        audit: "AuditLogService | None" = None,
    ) -> None:
        self._repository = repository
        self._audit = audit

    async def list_all(self) -> list[DomainT]:
        return await self._repository.list_all()

    async def get_by_id(self, entity_id: int) -> DomainT:
        entity = await self._repository.get_by_id(entity_id)
        if entity is None:
            raise EntityNotFoundError(self.entity_name, entity_id)
        return entity

    async def _record(
        self, acting_user: "User | None", verb: str, entity: DomainT, entity_id: int
    ) -> None:
        if self._audit is None:
            return
        label = getattr(entity, "name", None) or f"#{entity_id}"
        await self._audit.record(
            acting_user,
            f"{self.entity_name.lower()}.{verb}",
            self.entity_name,
            entity_id,
            summary=f"{verb.capitalize()} {self.entity_name.lower()} {label}",
        )

    async def create(self, entity: DomainT, *, acting_user: "User | None" = None) -> DomainT:
        created = await self._repository.create(entity)
        await self._record(acting_user, "create", created, created.id)  # type: ignore[attr-defined]
        return created

    async def update(
        self, entity_id: int, entity: DomainT, *, acting_user: "User | None" = None
    ) -> DomainT:
        await self.get_by_id(entity_id)
        entity.id = entity_id  # type: ignore[attr-defined]
        updated = await self._repository.update(entity)
        await self._record(acting_user, "update", updated, entity_id)
        return updated

    async def delete(self, entity_id: int, *, acting_user: "User | None" = None) -> None:
        entity = await self.get_by_id(entity_id)
        await self._repository.delete(entity_id)
        await self._record(acting_user, "delete", entity, entity_id)
