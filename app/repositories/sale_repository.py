from abc import ABC, abstractmethod
from datetime import datetime

from app.domain.sale import Sale
from app.infrastructure.db.models.sale_model import SaleModel
from app.repositories.base_repository import SqlAlchemyRepository


class SaleRepository(ABC):
    """A sale is append-only once created: no update/delete are exposed here.
    Corrections happen through a future Exchange/Return flow, not by editing
    the original sale."""

    @abstractmethod
    async def list_all(self) -> list[Sale]: ...

    @abstractmethod
    async def get_by_id(self, sale_id: int) -> Sale | None: ...

    @abstractmethod
    async def create(self, sale: Sale) -> Sale: ...

    @abstractmethod
    async def mark_cancelled(self, sale_id: int, cancelled_at: datetime) -> Sale:
        """The one exception to 'a Sale is append-only': cancellation is a
        state transition, not an edit of the sale's own recorded numbers."""
        ...


class SqlAlchemySaleRepository(SqlAlchemyRepository[SaleModel], SaleRepository):
    model = SaleModel

    async def list_all(self) -> list[Sale]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, sale_id: int) -> Sale | None:
        model = await self._get_model(sale_id)
        return self._to_domain(model) if model else None

    async def mark_cancelled(self, sale_id: int, cancelled_at: datetime) -> Sale:
        model = await self._get_model(sale_id)
        model.cancelled_at = cancelled_at
        await self._session.flush()
        return self._to_domain(model)

    async def create(self, sale: Sale) -> Sale:
        model = SaleModel(
            branch_id=sale.branch_id,
            subtotal=sale.subtotal,
            discount=sale.discount,
            promotion_discount=sale.promotion_discount,
            discount_reason=sale.discount_reason,
            total=sale.total,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: SaleModel) -> Sale:
        return Sale(
            id=model.id,
            branch_id=model.branch_id,
            subtotal=model.subtotal,
            discount=model.discount,
            promotion_discount=model.promotion_discount,
            discount_reason=model.discount_reason,
            total=model.total,
            created_at=model.created_at,
            cancelled_at=model.cancelled_at,
        )
