from abc import ABC, abstractmethod

from app.domain.product import Product
from app.infrastructure.db.models.product_model import ProductModel
from app.repositories.base_repository import SqlAlchemyRepository


class ProductRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[Product]: ...

    @abstractmethod
    async def get_by_id(self, product_id: int) -> Product | None: ...

    @abstractmethod
    async def create(self, product: Product) -> Product: ...

    @abstractmethod
    async def update(self, product: Product) -> Product: ...

    @abstractmethod
    async def delete(self, product_id: int) -> None: ...


class SqlAlchemyProductRepository(SqlAlchemyRepository[ProductModel], ProductRepository):
    model = ProductModel

    async def list_all(self) -> list[Product]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, product_id: int) -> Product | None:
        model = await self._get_model(product_id)
        return self._to_domain(model) if model else None

    async def create(self, product: Product) -> Product:
        model = ProductModel(
            name=product.name,
            description=product.description,
            image_url=product.image_url,
            category_id=product.category_id,
            brand_id=product.brand_id,
            cost=product.cost,
            price=product.price,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, product: Product) -> Product:
        model = await self._get_model(product.id)
        model.name = product.name
        model.description = product.description
        model.image_url = product.image_url
        model.category_id = product.category_id
        model.brand_id = product.brand_id
        model.cost = product.cost
        model.price = product.price
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, product_id: int) -> None:
        model = await self._get_model(product_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: ProductModel) -> Product:
        return Product(
            id=model.id,
            name=model.name,
            description=model.description,
            image_url=model.image_url,
            category_id=model.category_id,
            brand_id=model.brand_id,
            cost=model.cost,
            price=model.price,
        )
