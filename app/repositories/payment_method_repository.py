from abc import ABC, abstractmethod

from app.domain.payment_method import PaymentMethod
from app.infrastructure.db.models.payment_method_model import PaymentMethodModel
from app.repositories.base_repository import SqlAlchemyRepository


class PaymentMethodRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[PaymentMethod]: ...

    @abstractmethod
    async def get_by_id(self, payment_method_id: int) -> PaymentMethod | None: ...

    @abstractmethod
    async def create(self, payment_method: PaymentMethod) -> PaymentMethod: ...

    @abstractmethod
    async def update(self, payment_method: PaymentMethod) -> PaymentMethod: ...

    @abstractmethod
    async def delete(self, payment_method_id: int) -> None: ...


class SqlAlchemyPaymentMethodRepository(
    SqlAlchemyRepository[PaymentMethodModel], PaymentMethodRepository
):
    model = PaymentMethodModel

    async def list_all(self) -> list[PaymentMethod]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, payment_method_id: int) -> PaymentMethod | None:
        model = await self._get_model(payment_method_id)
        return self._to_domain(model) if model else None

    async def create(self, payment_method: PaymentMethod) -> PaymentMethod:
        model = PaymentMethodModel(
            name=payment_method.name,
            surcharge_percentage=payment_method.surcharge_percentage,
            is_cash=payment_method.is_cash,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, payment_method: PaymentMethod) -> PaymentMethod:
        model = await self._get_model(payment_method.id)
        model.name = payment_method.name
        model.surcharge_percentage = payment_method.surcharge_percentage
        model.is_cash = payment_method.is_cash
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, payment_method_id: int) -> None:
        model = await self._get_model(payment_method_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: PaymentMethodModel) -> PaymentMethod:
        return PaymentMethod(
            id=model.id,
            name=model.name,
            surcharge_percentage=model.surcharge_percentage,
            is_cash=model.is_cash,
        )
