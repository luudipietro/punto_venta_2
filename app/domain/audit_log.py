from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class AuditLog:
    actor_username: str
    action: str
    entity_type: str
    entity_id: int
    actor_user_id: int | None = None
    branch_id: int | None = None
    summary: str = ""
    id: int | None = None
    created_at: datetime | None = None
