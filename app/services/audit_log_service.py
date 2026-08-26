from datetime import date

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.audit_log import AuditLog
from app.domain.user import User
from app.infrastructure.db.session import get_db
from app.repositories.audit_log_repository import (
    AuditLogRepository,
    SqlAlchemyAuditLogRepository,
)


class AuditLogService:
    """Append-only trail of who did what, when — no update/delete, same
    shape as Sale/Purchase. `record()` is called by other services right
    after their own mutation succeeds, sharing the same session so the
    audit entry is atomic with the operation it documents (flush, not
    commit — the request's get_db commits everything together)."""

    def __init__(self, repository: AuditLogRepository) -> None:
        self._repository = repository

    async def record(
        self,
        actor: User | None,
        action: str,
        entity_type: str,
        entity_id: int,
        *,
        branch_id: int | None = None,
        summary: str = "",
    ) -> AuditLog:
        return await self._repository.create(
            AuditLog(
                actor_user_id=actor.id if actor else None,
                actor_username=actor.username if actor else "sistema",
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                branch_id=branch_id,
                summary=summary,
            )
        )

    async def list_all(
        self,
        *,
        start_date: date | None = None,
        end_date: date | None = None,
        branch_id: int | None = None,
        action: str | None = None,
        actor_user_id: int | None = None,
    ) -> list[AuditLog]:
        return await self._repository.list_all(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            action=action,
            actor_user_id=actor_user_id,
        )


def get_audit_log_service(session: AsyncSession = Depends(get_db)) -> AuditLogService:
    return AuditLogService(SqlAlchemyAuditLogRepository(session))
