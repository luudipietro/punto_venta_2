from abc import ABC, abstractmethod

from app.domain.branch import Branch
from app.infrastructure.db.models.branch_model import BranchModel
from app.repositories.base_repository import SqlAlchemyRepository


class BranchRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[Branch]: ...

    @abstractmethod
    async def get_by_id(self, branch_id: int) -> Branch | None: ...

    @abstractmethod
    async def create(self, branch: Branch) -> Branch: ...

    @abstractmethod
    async def update(self, branch: Branch) -> Branch: ...

    @abstractmethod
    async def delete(self, branch_id: int) -> None: ...


class SqlAlchemyBranchRepository(SqlAlchemyRepository[BranchModel], BranchRepository):
    model = BranchModel

    async def list_all(self) -> list[Branch]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, branch_id: int) -> Branch | None:
        model = await self._get_model(branch_id)
        return self._to_domain(model) if model else None

    async def create(self, branch: Branch) -> Branch:
        model = BranchModel(name=branch.name)
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, branch: Branch) -> Branch:
        model = await self._get_model(branch.id)
        model.name = branch.name
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, branch_id: int) -> None:
        model = await self._get_model(branch_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: BranchModel) -> Branch:
        return Branch(id=model.id, name=model.name)
