from dataclasses import dataclass


@dataclass(slots=True)
class Color:
    name: str
    hex_code: str = "#000000"
    id: int | None = None
