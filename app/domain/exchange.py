from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class Exchange:
    sale_id: int
    branch_id: int
    id: int | None = None
    created_at: datetime | None = None
