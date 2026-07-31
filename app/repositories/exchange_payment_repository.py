from abc import ABC, abstractmethod

from sqlalchemy import select

from app.domain.exchange_payment import ExchangePayment
from app.infrastructure.db.models.exchange_payment_model import ExchangePaymentModel
from app.repositories.base_repository import SqlAlchemyRepository


class ExchangePaymentRepository(ABC):
    @abstractmethod
    async def list_by_exchange(self, exchange_id: int) -> list[ExchangePayment]: ...

    @abstractmethod
    async def create(self, payment: ExchangePayment) -> ExchangePayment: ...


class SqlAlchemyExchangePaymentRepository(
    SqlAlchemyRepository[ExchangePaymentModel], ExchangePaymentRepository
):
    model = ExchangePaymentModel

    async def list_by_exchange(self, exchange_id: int) -> list[ExchangePayment]:
        result = await self._session.execute(
            select(ExchangePaymentModel).where(ExchangePaymentModel.exchange_id == exchange_id)
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def create(self, payment: ExchangePayment) -> ExchangePayment:
        model = ExchangePaymentModel(
            exchange_id=payment.exchange_id,
            payment_method_id=payment.payment_method_id,
            amount=payment.amount,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: ExchangePaymentModel) -> ExchangePayment:
        return ExchangePayment(
            id=model.id,
            exchange_id=model.exchange_id,
            payment_method_id=model.payment_method_id,
            amount=model.amount,
        )
