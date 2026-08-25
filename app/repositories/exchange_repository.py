from abc import ABC, abstractmethod
from datetime import datetime

from sqlalchemy import select

from app.domain.exchange import Exchange
from app.infrastructure.db.models.exchange_model import ExchangeModel
from app.repositories.base_repository import SqlAlchemyRepository


class ExchangeRepository(ABC):
    """An exchange is append-only once created: no update/delete are exposed
    here, mirroring how a Sale is never edited after the fact. mark_cancelled
    is the one exception, same shape as SaleRepository.mark_cancelled."""

    @abstractmethod
    async def list_all(self) -> list[Exchange]: ...

    @abstractmethod
    async def list_by_sale(self, sale_id: int) -> list[Exchange]: ...

    @abstractmethod
    async def get_by_id(self, exchange_id: int) -> Exchange | None: ...

    @abstractmethod
    async def create(self, exchange: Exchange) -> Exchange: ...

    @abstractmethod
    async def mark_cancelled(self, exchange_id: int, cancelled_at: datetime) -> Exchange: ...


class SqlAlchemyExchangeRepository(SqlAlchemyRepository[ExchangeModel], ExchangeRepository):
    model = ExchangeModel

    async def list_all(self) -> list[Exchange]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def list_by_sale(self, sale_id: int) -> list[Exchange]:
        result = await self._session.execute(
            select(ExchangeModel).where(ExchangeModel.sale_id == sale_id)
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def get_by_id(self, exchange_id: int) -> Exchange | None:
        model = await self._get_model(exchange_id)
        return self._to_domain(model) if model else None

    async def create(self, exchange: Exchange) -> Exchange:
        model = ExchangeModel(sale_id=exchange.sale_id, branch_id=exchange.branch_id)
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def mark_cancelled(self, exchange_id: int, cancelled_at: datetime) -> Exchange:
        model = await self._get_model(exchange_id)
        model.cancelled_at = cancelled_at
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: ExchangeModel) -> Exchange:
        return Exchange(
            id=model.id,
            sale_id=model.sale_id,
            branch_id=model.branch_id,
            created_at=model.created_at,
            cancelled_at=model.cancelled_at,
        )
