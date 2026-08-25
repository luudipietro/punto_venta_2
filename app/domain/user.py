from dataclasses import dataclass
from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    EMPLEADO = "empleado"


@dataclass(slots=True)
class User:
    username: str
    password_hash: str
    role: UserRole
    branch_id: int | None
    id: int | None = None
