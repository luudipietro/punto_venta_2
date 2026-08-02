from abc import ABC, abstractmethod

from sqlalchemy import delete, select

from app.domain.promotion_item import PromotionItem
from app.infrastructure.db.models.promotion_item_model import PromotionItemModel
from app.repositories.base_repository import SqlAlchemyRepository


class PromotionItemRepository(ABC):
    @abstractmethod
    async def list_by_promotion(self, promotion_id: int) -> list[PromotionItem]: ...

    @abstractmethod
    async def create(self, promotion_item: PromotionItem) -> PromotionItem: ...

    @abstractmethod
    async def delete_by_promotion(self, promotion_id: int) -> None: ...


class SqlAlchemyPromotionItemRepository(
    SqlAlchemyRepository[PromotionItemModel], PromotionItemRepository
):
    model = PromotionItemModel

    async def list_by_promotion(self, promotion_id: int) -> list[PromotionItem]:
        result = await self._session.execute(
            select(PromotionItemModel).where(PromotionItemModel.promotion_id == promotion_id)
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def create(self, promotion_item: PromotionItem) -> PromotionItem:
        model = PromotionItemModel(
            promotion_id=promotion_item.promotion_id,
            product_id=promotion_item.product_id,
            category_id=promotion_item.category_id,
            discount_type=promotion_item.discount_type,
            discount_value=promotion_item.discount_value,
            min_quantity=promotion_item.min_quantity,
            max_quantity=promotion_item.max_quantity,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def delete_by_promotion(self, promotion_id: int) -> None:
        await self._session.execute(
            delete(PromotionItemModel).where(PromotionItemModel.promotion_id == promotion_id)
        )
        await self._session.flush()

    @staticmethod
    def _to_domain(model: PromotionItemModel) -> PromotionItem:
        return PromotionItem(
            id=model.id,
            promotion_id=model.promotion_id,
            product_id=model.product_id,
            category_id=model.category_id,
            discount_type=model.discount_type,
            discount_value=model.discount_value,
            min_quantity=model.min_quantity,
            max_quantity=model.max_quantity,
        )
