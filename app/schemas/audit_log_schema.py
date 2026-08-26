from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_user_id: int | None
    actor_username: str
    action: str
    entity_type: str
    entity_id: int
    branch_id: int | None
    summary: str
    created_at: datetime
