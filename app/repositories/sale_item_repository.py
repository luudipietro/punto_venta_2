from abc import ABC, abstractmethod

from sqlalchemy import select

from app.domain.sale_item import SaleItem
from app.infrastructure.db.models.sale_item_model import SaleItemModel
from app.repositories.base_repository import SqlAlchemyRepository


class SaleItemRepository(ABC):
    @abstractmethod
    async def list_by_sale(self, sale_id: int) -> list[SaleItem]: ...

    @abstractmethod
    async def create(self, sale_item: SaleItem) -> SaleItem: ...


class SqlAlchemySaleItemRepository(SqlAlchemyRepository[SaleItemModel], SaleItemRepository):
    model = SaleItemModel

    async def list_by_sale(self, sale_id: int) -> list[SaleItem]:
        result = await self._session.execute(
            select(SaleItemModel).where(SaleItemModel.sale_id == sale_id)
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def create(self, sale_item: SaleItem) -> SaleItem:
        model = SaleItemModel(
            sale_id=sale_item.sale_id,
            stock_id=sale_item.stock_id,
            quantity=sale_item.quantity,
            unit_price=sale_item.unit_price,
            promotion_id=sale_item.promotion_id,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: SaleItemModel) -> SaleItem:
        return SaleItem(
            id=model.id,
            sale_id=model.sale_id,
            stock_id=model.stock_id,
            quantity=model.quantity,
            unit_price=model.unit_price,
            promotion_id=model.promotion_id,
        )
