from abc import ABC, abstractmethod

from sqlalchemy import select

from app.domain.purchase_item import PurchaseItem
from app.infrastructure.db.models.purchase_item_model import PurchaseItemModel
from app.repositories.base_repository import SqlAlchemyRepository


class PurchaseItemRepository(ABC):
    @abstractmethod
    async def list_by_purchase(self, purchase_id: int) -> list[PurchaseItem]: ...

    @abstractmethod
    async def create(self, purchase_item: PurchaseItem) -> PurchaseItem: ...


class SqlAlchemyPurchaseItemRepository(
    SqlAlchemyRepository[PurchaseItemModel], PurchaseItemRepository
):
    model = PurchaseItemModel

    async def list_by_purchase(self, purchase_id: int) -> list[PurchaseItem]:
        result = await self._session.execute(
            select(PurchaseItemModel).where(PurchaseItemModel.purchase_id == purchase_id)
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def create(self, purchase_item: PurchaseItem) -> PurchaseItem:
        model = PurchaseItemModel(
            purchase_id=purchase_item.purchase_id,
            stock_id=purchase_item.stock_id,
            quantity=purchase_item.quantity,
            unit_cost=purchase_item.unit_cost,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: PurchaseItemModel) -> PurchaseItem:
        return PurchaseItem(
            id=model.id,
            purchase_id=model.purchase_id,
            stock_id=model.stock_id,
            quantity=model.quantity,
            unit_cost=model.unit_cost,
        )
