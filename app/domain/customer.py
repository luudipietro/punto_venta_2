from dataclasses import dataclass


@dataclass(slots=True)
class Customer:
    dni: str
    name: str
    id: int | None = None
