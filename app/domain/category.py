from dataclasses import dataclass


@dataclass(slots=True)
class Category:
    name: str
    description: str | None = None
    id: int | None = None
