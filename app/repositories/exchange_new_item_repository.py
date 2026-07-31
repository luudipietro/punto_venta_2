from abc import ABC, abstractmethod

from sqlalchemy import select

from app.domain.exchange_new_item import ExchangeNewItem
from app.infrastructure.db.models.exchange_new_item_model import ExchangeNewItemModel
from app.repositories.base_repository import SqlAlchemyRepository


class ExchangeNewItemRepository(ABC):
    @abstractmethod
    async def list_by_exchange(self, exchange_id: int) -> list[ExchangeNewItem]: ...

    @abstractmethod
    async def create(self, item: ExchangeNewItem) -> ExchangeNewItem: ...


class SqlAlchemyExchangeNewItemRepository(
    SqlAlchemyRepository[ExchangeNewItemModel], ExchangeNewItemRepository
):
    model = ExchangeNewItemModel

    async def list_by_exchange(self, exchange_id: int) -> list[ExchangeNewItem]:
        result = await self._session.execute(
            select(ExchangeNewItemModel).where(ExchangeNewItemModel.exchange_id == exchange_id)
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def create(self, item: ExchangeNewItem) -> ExchangeNewItem:
        model = ExchangeNewItemModel(
            exchange_id=item.exchange_id,
            stock_id=item.stock_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: ExchangeNewItemModel) -> ExchangeNewItem:
        return ExchangeNewItem(
            id=model.id,
            exchange_id=model.exchange_id,
            stock_id=model.stock_id,
            quantity=model.quantity,
            unit_price=model.unit_price,
        )
