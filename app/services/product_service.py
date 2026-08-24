from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import EntityNotFoundError
from app.domain.product import Product
from app.infrastructure.db.session import get_db
from app.repositories.brand_repository import BrandRepository, SqlAlchemyBrandRepository
from app.repositories.category_repository import CategoryRepository, SqlAlchemyCategoryRepository
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.services.base_service import CrudService


class ProductService(CrudService[Product]):
    entity_name = "Product"

    def __init__(
        self,
        repository: ProductRepository,
        category_repository: CategoryRepository,
        brand_repository: BrandRepository,
    ) -> None:
        super().__init__(repository)
        self._category_repository = category_repository
        self._brand_repository = brand_repository

    async def create(self, product: Product) -> Product:
        await self._ensure_references_exist(product)
        return await super().create(product)

    async def update(self, entity_id: int, product: Product) -> Product:
        await self._ensure_references_exist(product)
        return await super().update(entity_id, product)

    async def _ensure_references_exist(self, product: Product) -> None:
        if product.category_id is not None:
            if await self._category_repository.get_by_id(product.category_id) is None:
                raise EntityNotFoundError("Category", product.category_id)
        if product.brand_id is not None:
            if await self._brand_repository.get_by_id(product.brand_id) is None:
                raise EntityNotFoundError("Brand", product.brand_id)


def get_product_service(session: AsyncSession = Depends(get_db)) -> ProductService:
    return ProductService(
        SqlAlchemyProductRepository(session),
        SqlAlchemyCategoryRepository(session),
        SqlAlchemyBrandRepository(session),
    )
