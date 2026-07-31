from abc import ABC, abstractmethod

from sqlalchemy import select

from app.domain.sale_payment import SalePayment
from app.infrastructure.db.models.sale_payment_model import SalePaymentModel
from app.repositories.base_repository import SqlAlchemyRepository


class SalePaymentRepository(ABC):
    @abstractmethod
    async def list_by_sale(self, sale_id: int) -> list[SalePayment]: ...

    @abstractmethod
    async def create(self, sale_payment: SalePayment) -> SalePayment: ...


class SqlAlchemySalePaymentRepository(
    SqlAlchemyRepository[SalePaymentModel], SalePaymentRepository
):
    model = SalePaymentModel

    async def list_by_sale(self, sale_id: int) -> list[SalePayment]:
        result = await self._session.execute(
            select(SalePaymentModel).where(SalePaymentModel.sale_id == sale_id)
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def create(self, sale_payment: SalePayment) -> SalePayment:
        model = SalePaymentModel(
            sale_id=sale_payment.sale_id,
            payment_method_id=sale_payment.payment_method_id,
            amount_without_surcharge=sale_payment.amount_without_surcharge,
            amount_with_surcharge=sale_payment.amount_with_surcharge,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: SalePaymentModel) -> SalePayment:
        return SalePayment(
            id=model.id,
            sale_id=model.sale_id,
            payment_method_id=model.payment_method_id,
            amount_without_surcharge=model.amount_without_surcharge,
            amount_with_surcharge=model.amount_with_surcharge,
        )
