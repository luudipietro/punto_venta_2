from abc import ABC, abstractmethod

from sqlalchemy import select

from app.domain.user import User
from app.infrastructure.db.models.user_model import UserModel
from app.repositories.base_repository import SqlAlchemyRepository


class UserRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[User]: ...

    @abstractmethod
    async def get_by_id(self, user_id: int) -> User | None: ...

    @abstractmethod
    async def get_by_username(self, username: str) -> User | None: ...

    @abstractmethod
    async def create(self, user: User) -> User: ...

    @abstractmethod
    async def update(self, user: User) -> User: ...

    @abstractmethod
    async def delete(self, user_id: int) -> None: ...


class SqlAlchemyUserRepository(SqlAlchemyRepository[UserModel], UserRepository):
    model = UserModel

    async def list_all(self) -> list[User]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, user_id: int) -> User | None:
        model = await self._get_model(user_id)
        return self._to_domain(model) if model else None

    async def get_by_username(self, username: str) -> User | None:
        result = await self._session.execute(
            select(UserModel).where(UserModel.username == username)
        )
        model = result.scalar_one_or_none()
        return self._to_domain(model) if model else None

    async def create(self, user: User) -> User:
        model = UserModel(
            username=user.username,
            password_hash=user.password_hash,
            role=user.role,
            branch_id=user.branch_id,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, user: User) -> User:
        model = await self._get_model(user.id)
        model.username = user.username
        model.password_hash = user.password_hash
        model.role = user.role
        model.branch_id = user.branch_id
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, user_id: int) -> None:
        model = await self._get_model(user_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: UserModel) -> User:
        return User(
            id=model.id,
            username=model.username,
            password_hash=model.password_hash,
            role=model.role,
            branch_id=model.branch_id,
        )
