from pydantic import BaseModel, ConfigDict

from app.domain.user import UserRole


class UserBase(BaseModel):
    username: str
    role: UserRole
    branch_id: int | None = None


class UserCreate(UserBase):
    password: str


class UserUpdate(UserBase):
    password: str | None = None
    current_password: str | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
