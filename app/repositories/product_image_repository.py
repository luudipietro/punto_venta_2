from abc import ABC, abstractmethod

from sqlalchemy import select

from app.domain.product_image import ProductImage
from app.infrastructure.db.models.product_image_model import ProductImageModel
from app.repositories.base_repository import SqlAlchemyRepository


class ProductImageRepository(ABC):
    @abstractmethod
    async def list_by_product(self, product_id: int) -> list[ProductImage]: ...

    @abstractmethod
    async def get_by_id(self, image_id: int) -> ProductImage | None: ...

    @abstractmethod
    async def create(self, image: ProductImage) -> ProductImage: ...

    @abstractmethod
    async def delete(self, image_id: int) -> None: ...


class SqlAlchemyProductImageRepository(
    SqlAlchemyRepository[ProductImageModel], ProductImageRepository
):
    model = ProductImageModel

    async def list_by_product(self, product_id: int) -> list[ProductImage]:
        result = await self._session.execute(
            select(ProductImageModel).where(ProductImageModel.product_id == product_id)
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def get_by_id(self, image_id: int) -> ProductImage | None:
        model = await self._get_model(image_id)
        return self._to_domain(model) if model else None

    async def create(self, image: ProductImage) -> ProductImage:
        model = ProductImageModel(product_id=image.product_id, url=image.url)
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, image_id: int) -> None:
        model = await self._get_model(image_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: ProductImageModel) -> ProductImage:
        return ProductImage(id=model.id, product_id=model.product_id, url=model.url)
