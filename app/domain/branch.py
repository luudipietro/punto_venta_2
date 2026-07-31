from dataclasses import dataclass


@dataclass(slots=True)
class Branch:
    name: str
    id: int | None = None
