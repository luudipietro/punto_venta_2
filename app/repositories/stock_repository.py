from abc import ABC, abstractmethod

from app.domain.stock import Stock
from app.infrastructure.db.models.stock_model import StockModel
from app.repositories.base_repository import SqlAlchemyRepository


class StockRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[Stock]: ...

    @abstractmethod
    async def get_by_id(self, stock_id: int) -> Stock | None: ...

    @abstractmethod
    async def create(self, stock: Stock) -> Stock: ...

    @abstractmethod
    async def update(self, stock: Stock) -> Stock: ...

    @abstractmethod
    async def delete(self, stock_id: int) -> None: ...


class SqlAlchemyStockRepository(SqlAlchemyRepository[StockModel], StockRepository):
    model = StockModel

    async def list_all(self) -> list[Stock]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, stock_id: int) -> Stock | None:
        model = await self._get_model(stock_id)
        return self._to_domain(model) if model else None

    async def create(self, stock: Stock) -> Stock:
        model = StockModel(
            product_id=stock.product_id,
            color_id=stock.color_id,
            size_id=stock.size_id,
            branch_id=stock.branch_id,
            quantity=stock.quantity,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, stock: Stock) -> Stock:
        model = await self._get_model(stock.id)
        model.product_id = stock.product_id
        model.color_id = stock.color_id
        model.size_id = stock.size_id
        model.branch_id = stock.branch_id
        model.quantity = stock.quantity
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, stock_id: int) -> None:
        model = await self._get_model(stock_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: StockModel) -> Stock:
        return Stock(
            id=model.id,
            product_id=model.product_id,
            color_id=model.color_id,
            size_id=model.size_id,
            branch_id=model.branch_id,
            quantity=model.quantity,
        )
