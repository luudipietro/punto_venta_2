from abc import ABC, abstractmethod
from datetime import date, datetime

from app.domain.purchase import Purchase
from app.infrastructure.db.models.purchase_model import PurchaseModel
from app.repositories.base_repository import SqlAlchemyRepository


class PurchaseRepository(ABC):
    """A purchase is append-only once created: no update/delete are exposed
    here, mirroring how a Sale is never edited after the fact. mark_paid is the
    one exception, same shape as SaleRepository.mark_cancelled."""

    @abstractmethod
    async def list_all(self) -> list[Purchase]: ...

    @abstractmethod
    async def get_by_id(self, purchase_id: int) -> Purchase | None: ...

    @abstractmethod
    async def create(self, purchase: Purchase) -> Purchase: ...

    @abstractmethod
    async def mark_paid(
        self, purchase_id: int, payment_method_id: int, payment_date: date
    ) -> Purchase: ...

    @abstractmethod
    async def mark_cancelled(self, purchase_id: int, cancelled_at: datetime) -> Purchase: ...


class SqlAlchemyPurchaseRepository(SqlAlchemyRepository[PurchaseModel], PurchaseRepository):
    model = PurchaseModel

    async def list_all(self) -> list[Purchase]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, purchase_id: int) -> Purchase | None:
        model = await self._get_model(purchase_id)
        return self._to_domain(model) if model else None

    async def create(self, purchase: Purchase) -> Purchase:
        model = PurchaseModel(
            branch_id=purchase.branch_id,
            supplier_name=purchase.supplier_name,
            subtotal=purchase.subtotal,
            total=purchase.total,
            payment_method_id=purchase.payment_method_id,
            payment_date=purchase.payment_date,
            is_paid=purchase.is_paid,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def mark_paid(
        self, purchase_id: int, payment_method_id: int, payment_date: date
    ) -> Purchase:
        model = await self._get_model(purchase_id)
        model.payment_method_id = payment_method_id
        model.payment_date = payment_date
        model.is_paid = True
        await self._session.flush()
        return self._to_domain(model)

    async def mark_cancelled(self, purchase_id: int, cancelled_at: datetime) -> Purchase:
        model = await self._get_model(purchase_id)
        model.cancelled_at = cancelled_at
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: PurchaseModel) -> Purchase:
        return Purchase(
            id=model.id,
            branch_id=model.branch_id,
            supplier_name=model.supplier_name,
            subtotal=model.subtotal,
            total=model.total,
            payment_method_id=model.payment_method_id,
            payment_date=model.payment_date,
            is_paid=model.is_paid,
            cancelled_at=model.cancelled_at,
        )
