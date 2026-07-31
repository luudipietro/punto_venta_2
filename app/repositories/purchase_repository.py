from abc import ABC, abstractmethod

from app.domain.purchase import Purchase
from app.infrastructure.db.models.purchase_model import PurchaseModel
from app.repositories.base_repository import SqlAlchemyRepository


class PurchaseRepository(ABC):
    """A purchase is append-only once created: no update/delete are exposed
    here, mirroring how a Sale is never edited after the fact."""

    @abstractmethod
    async def list_all(self) -> list[Purchase]: ...

    @abstractmethod
    async def get_by_id(self, purchase_id: int) -> Purchase | None: ...

    @abstractmethod
    async def create(self, purchase: Purchase) -> Purchase: ...


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
        )
        self._session.add(model)
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
        )
