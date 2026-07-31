from abc import ABC, abstractmethod

from app.domain.brand import Brand
from app.infrastructure.db.models.brand_model import BrandModel
from app.repositories.base_repository import SqlAlchemyRepository


class BrandRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[Brand]: ...

    @abstractmethod
    async def get_by_id(self, brand_id: int) -> Brand | None: ...

    @abstractmethod
    async def create(self, brand: Brand) -> Brand: ...

    @abstractmethod
    async def update(self, brand: Brand) -> Brand: ...

    @abstractmethod
    async def delete(self, brand_id: int) -> None: ...


class SqlAlchemyBrandRepository(SqlAlchemyRepository[BrandModel], BrandRepository):
    model = BrandModel

    async def list_all(self) -> list[Brand]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, brand_id: int) -> Brand | None:
        model = await self._get_model(brand_id)
        return self._to_domain(model) if model else None

    async def create(self, brand: Brand) -> Brand:
        model = BrandModel(name=brand.name, description=brand.description)
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, brand: Brand) -> Brand:
        model = await self._get_model(brand.id)
        model.name = brand.name
        model.description = brand.description
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, brand_id: int) -> None:
        model = await self._get_model(brand_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: BrandModel) -> Brand:
        return Brand(id=model.id, name=model.name, description=model.description)
