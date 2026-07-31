from datetime import date

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.promotion import Promotion
from app.infrastructure.db.session import get_db
from app.repositories.category_repository import CategoryRepository, SqlAlchemyCategoryRepository
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.repositories.promotion_repository import PromotionRepository, SqlAlchemyPromotionRepository
from app.services.base_service import CrudService


class PromotionService(CrudService[Promotion]):
    entity_name = "Promotion"

    def __init__(
        self,
        repository: PromotionRepository,
        product_repository: ProductRepository,
        category_repository: CategoryRepository,
    ) -> None:
        super().__init__(repository)
        self._product_repository = product_repository
        self._category_repository = category_repository

    async def create(self, promotion: Promotion) -> Promotion:
        await self._validate_target(promotion)
        return await super().create(promotion)

    async def update(self, entity_id: int, promotion: Promotion) -> Promotion:
        await self._validate_target(promotion)
        return await super().update(entity_id, promotion)

    async def find_applicable(
        self, product_id: int, category_id: int, on_date: date
    ) -> Promotion | None:
        active = await self._repository.list_active(on_date)
        for promotion in active:
            if promotion.product_id == product_id:
                return promotion
        for promotion in active:
            if promotion.category_id == category_id:
                return promotion
        return None

    async def _validate_target(self, promotion: Promotion) -> None:
        if (promotion.product_id is None) == (promotion.category_id is None):
            raise BusinessRuleViolationError(
                "Promotion must target exactly one of product_id or category_id"
            )
        if promotion.product_id is not None:
            if await self._product_repository.get_by_id(promotion.product_id) is None:
                raise EntityNotFoundError("Product", promotion.product_id)
        if promotion.category_id is not None:
            if await self._category_repository.get_by_id(promotion.category_id) is None:
                raise EntityNotFoundError("Category", promotion.category_id)


def get_promotion_service(session: AsyncSession = Depends(get_db)) -> PromotionService:
    return PromotionService(
        SqlAlchemyPromotionRepository(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyCategoryRepository(session),
    )
