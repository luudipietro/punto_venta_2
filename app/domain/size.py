from dataclasses import dataclass


@dataclass(slots=True)
class Size:
    label: str
    id: int | None = None
