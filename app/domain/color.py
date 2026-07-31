from dataclasses import dataclass


@dataclass(slots=True)
class Color:
    name: str
    id: int | None = None
