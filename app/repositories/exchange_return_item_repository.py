from abc import ABC, abstractmethod

from sqlalchemy import select

from app.domain.exchange_return_item import ExchangeReturnItem
from app.infrastructure.db.models.exchange_model import ExchangeModel
from app.infrastructure.db.models.exchange_return_item_model import ExchangeReturnItemModel
from app.repositories.base_repository import SqlAlchemyRepository


class ExchangeReturnItemRepository(ABC):
    @abstractmethod
    async def list_by_exchange(self, exchange_id: int) -> list[ExchangeReturnItem]: ...

    @abstractmethod
    async def list_by_sale(self, sale_id: int) -> list[ExchangeReturnItem]:
        """All return items across every Exchange ever created against a
        given Sale — used to cap how much of a SaleItem can still be
        returned, accounting for what prior exchanges already returned."""
        ...

    @abstractmethod
    async def create(self, item: ExchangeReturnItem) -> ExchangeReturnItem: ...


class SqlAlchemyExchangeReturnItemRepository(
    SqlAlchemyRepository[ExchangeReturnItemModel], ExchangeReturnItemRepository
):
    model = ExchangeReturnItemModel

    async def list_by_exchange(self, exchange_id: int) -> list[ExchangeReturnItem]:
        result = await self._session.execute(
            select(ExchangeReturnItemModel).where(
                ExchangeReturnItemModel.exchange_id == exchange_id
            )
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def list_by_sale(self, sale_id: int) -> list[ExchangeReturnItem]:
        # Cancelled exchanges are excluded: cancelling one already reversed
        # its restock, so it should no longer count as "returned" either for
        # capping a future return or for computing what a Sale cancel needs
        # to restore.
        result = await self._session.execute(
            select(ExchangeReturnItemModel)
            .join(ExchangeModel, ExchangeModel.id == ExchangeReturnItemModel.exchange_id)
            .where(ExchangeModel.sale_id == sale_id, ExchangeModel.cancelled_at.is_(None))
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def create(self, item: ExchangeReturnItem) -> ExchangeReturnItem:
        model = ExchangeReturnItemModel(
            exchange_id=item.exchange_id,
            stock_id=item.stock_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: ExchangeReturnItemModel) -> ExchangeReturnItem:
        return ExchangeReturnItem(
            id=model.id,
            exchange_id=model.exchange_id,
            stock_id=model.stock_id,
            quantity=model.quantity,
            unit_price=model.unit_price,
        )
