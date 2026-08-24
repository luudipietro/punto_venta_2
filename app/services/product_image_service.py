from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.product_image import ProductImage
from app.infrastructure.db.session import get_db
from app.repositories.product_image_repository import (
    ProductImageRepository,
    SqlAlchemyProductImageRepository,
)
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository


class ProductImageService:
    """Manages a product's extra gallery images (beyond the cover
    `Product.image_url`) — kept as a thin, scoped-by-product-id service rather
    than a generic CrudService since every operation needs the owning
    product's id, not a bare entity id."""

    def __init__(
        self, repository: ProductImageRepository, product_repository: ProductRepository
    ) -> None:
        self._repository = repository
        self._product_repository = product_repository

    async def list_by_product(self, product_id: int) -> list[ProductImage]:
        return await self._repository.list_by_product(product_id)

    async def add_image(self, product_id: int, url: str) -> ProductImage:
        if await self._product_repository.get_by_id(product_id) is None:
            raise EntityNotFoundError("Product", product_id)
        return await self._repository.create(ProductImage(product_id=product_id, url=url))

    async def remove_image(self, product_id: int, image_id: int) -> None:
        image = await self._repository.get_by_id(image_id)
        if image is None:
            raise EntityNotFoundError("ProductImage", image_id)
        if image.product_id != product_id:
            raise BusinessRuleViolationError(
                f"Image {image_id} does not belong to product {product_id}"
            )
        await self._repository.delete(image_id)


def get_product_image_service(session: AsyncSession = Depends(get_db)) -> ProductImageService:
    return ProductImageService(
        SqlAlchemyProductImageRepository(session), SqlAlchemyProductRepository(session)
    )
