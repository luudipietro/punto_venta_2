from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.category import Category
from app.infrastructure.db.session import get_db
from app.repositories.category_repository import CategoryRepository, SqlAlchemyCategoryRepository
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.services.base_service import CrudService


class CategoryService(CrudService[Category]):
    entity_name = "Category"

    def __init__(
        self, repository: CategoryRepository, products: ProductRepository | None = None
    ) -> None:
        super().__init__(repository)
        self._products = products

    async def set_products(self, category_id: int, product_ids: list[int]) -> None:
        """Makes exactly `product_ids` the members of this category: listed
        products are moved into it (leaving any previous category), products
        currently in it but not listed end up uncategorized."""
        assert self._products is not None
        await self.get_by_id(category_id)
        wanted = set(product_ids)
        products = {p.id: p for p in await self._products.list_all()}
        missing = wanted - products.keys()
        if missing:
            raise EntityNotFoundError("Product", min(missing))
        for product in products.values():
            if product.id in wanted and product.category_id != category_id:
                await self._products.set_category(product.id, category_id)
            elif product.id not in wanted and product.category_id == category_id:
                await self._products.set_category(product.id, None)

    async def delete(self, entity_id: int) -> None:
        try:
            await super().delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: esta categoría tiene productos asociados"
            ) from exc


def get_category_service(session: AsyncSession = Depends(get_db)) -> CategoryService:
    return CategoryService(
        SqlAlchemyCategoryRepository(session), SqlAlchemyProductRepository(session)
    )
