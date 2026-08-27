from pydantic import BaseModel, ConfigDict, Field

from app.domain.user import UserRole

# No length/complexity requirement existed before this — an admin could set
# any other user's password to a single character. 8 is a floor, not a full
# policy (no complexity/rotation rules), matching this app's scope as a
# single-shop internal tool rather than a public-facing service.
_MIN_PASSWORD_LENGTH = 8


class UserBase(BaseModel):
    username: str
    role: UserRole
    branch_id: int | None = None


class UserCreate(UserBase):
    password: str = Field(min_length=_MIN_PASSWORD_LENGTH)


class UserUpdate(UserBase):
    password: str | None = Field(default=None, min_length=_MIN_PASSWORD_LENGTH)
    current_password: str | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
