from abc import ABC, abstractmethod

from app.domain.category import Category
from app.infrastructure.db.models.category_model import CategoryModel
from app.repositories.base_repository import SqlAlchemyRepository


class CategoryRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[Category]: ...

    @abstractmethod
    async def get_by_id(self, category_id: int) -> Category | None: ...

    @abstractmethod
    async def create(self, category: Category) -> Category: ...

    @abstractmethod
    async def update(self, category: Category) -> Category: ...

    @abstractmethod
    async def delete(self, category_id: int) -> None: ...


class SqlAlchemyCategoryRepository(SqlAlchemyRepository[CategoryModel], CategoryRepository):
    model = CategoryModel

    async def list_all(self) -> list[Category]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, category_id: int) -> Category | None:
        model = await self._get_model(category_id)
        return self._to_domain(model) if model else None

    async def create(self, category: Category) -> Category:
        model = CategoryModel(name=category.name, description=category.description)
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, category: Category) -> Category:
        model = await self._get_model(category.id)
        model.name = category.name
        model.description = category.description
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, category_id: int) -> None:
        model = await self._get_model(category_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: CategoryModel) -> Category:
        return Category(id=model.id, name=model.name, description=model.description)
