from dataclasses import dataclass


@dataclass(slots=True)
class Brand:
    name: str
    description: str | None = None
    id: int | None = None
