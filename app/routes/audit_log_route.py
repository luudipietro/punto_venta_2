from datetime import date

from fastapi import APIRouter, Depends, Query

from app.core.auth import require_admin
from app.domain.audit_log import AuditLog
from app.schemas.audit_log_schema import AuditLogRead
from app.services.audit_log_service import AuditLogService, get_audit_log_service

router = APIRouter(
    prefix="/audit-logs", tags=["Audit"], dependencies=[Depends(require_admin)]
)


@router.get("", response_model=list[AuditLogRead])
async def list_audit_logs(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    actor_user_id: int | None = Query(default=None),
    service: AuditLogService = Depends(get_audit_log_service),
) -> list[AuditLog]:
    return await service.list_all(
        start_date=start_date,
        end_date=end_date,
        branch_id=branch_id,
        action=action,
        actor_user_id=actor_user_id,
    )
