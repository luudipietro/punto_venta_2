from dataclasses import dataclass


@dataclass(slots=True)
class Customer:
    dni: str
    name: str
    email: str | None = None
    phone: str | None = None
    id: int | None = None
