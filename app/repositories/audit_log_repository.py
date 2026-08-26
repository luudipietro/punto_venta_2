from abc import ABC, abstractmethod
from datetime import date, datetime, time

from sqlalchemy import select

from app.domain.audit_log import AuditLog
from app.infrastructure.db.models.audit_log_model import AuditLogModel
from app.repositories.base_repository import SqlAlchemyRepository


class AuditLogRepository(ABC):
    @abstractmethod
    async def create(self, entry: AuditLog) -> AuditLog: ...

    @abstractmethod
    async def list_all(
        self,
        *,
        start_date: date | None = None,
        end_date: date | None = None,
        branch_id: int | None = None,
        action: str | None = None,
        actor_user_id: int | None = None,
    ) -> list[AuditLog]:
        """Lists audit entries, most recent first, filtered at the SQL level
        (this table can grow faster than the rest — no in-memory filtering)."""
        ...


class SqlAlchemyAuditLogRepository(SqlAlchemyRepository[AuditLogModel], AuditLogRepository):
    model = AuditLogModel

    async def create(self, entry: AuditLog) -> AuditLog:
        model = AuditLogModel(
            actor_user_id=entry.actor_user_id,
            actor_username=entry.actor_username,
            action=entry.action,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            branch_id=entry.branch_id,
            summary=entry.summary,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def list_all(
        self,
        *,
        start_date: date | None = None,
        end_date: date | None = None,
        branch_id: int | None = None,
        action: str | None = None,
        actor_user_id: int | None = None,
    ) -> list[AuditLog]:
        statement = select(AuditLogModel).order_by(AuditLogModel.created_at.desc())
        if start_date is not None:
            statement = statement.where(
                AuditLogModel.created_at >= datetime.combine(start_date, time.min)
            )
        if end_date is not None:
            statement = statement.where(
                AuditLogModel.created_at <= datetime.combine(end_date, time.max)
            )
        if branch_id is not None:
            statement = statement.where(AuditLogModel.branch_id == branch_id)
        if action is not None:
            statement = statement.where(AuditLogModel.action == action)
        if actor_user_id is not None:
            statement = statement.where(AuditLogModel.actor_user_id == actor_user_id)
        result = await self._session.execute(statement)
        return [self._to_domain(model) for model in result.scalars().all()]

    @staticmethod
    def _to_domain(model: AuditLogModel) -> AuditLog:
        return AuditLog(
            id=model.id,
            actor_user_id=model.actor_user_id,
            actor_username=model.actor_username,
            action=model.action,
            entity_type=model.entity_type,
            entity_id=model.entity_id,
            branch_id=model.branch_id,
            summary=model.summary,
            created_at=model.created_at,
        )
