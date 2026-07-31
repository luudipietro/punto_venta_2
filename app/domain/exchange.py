from dataclasses import dataclass


@dataclass(slots=True)
class Exchange:
    sale_id: int
    id: int | None = None
