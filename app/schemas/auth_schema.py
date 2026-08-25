from pydantic import BaseModel

from app.schemas.user_schema import UserRead


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
