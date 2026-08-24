from abc import ABC, abstractmethod

from sqlalchemy import or_, select

from app.domain.customer import Customer
from app.infrastructure.db.models.customer_model import CustomerModel
from app.repositories.base_repository import SqlAlchemyRepository


class CustomerRepository(ABC):
    @abstractmethod
    async def list_all(self, q: str | None = None) -> list[Customer]:
        """Lists customers, optionally filtered by a case-insensitive
        substring match on `dni` or `name` (for the checkout search box)."""
        ...

    @abstractmethod
    async def get_by_id(self, customer_id: int) -> Customer | None: ...

    @abstractmethod
    async def create(self, customer: Customer) -> Customer: ...

    @abstractmethod
    async def update(self, customer: Customer) -> Customer: ...

    @abstractmethod
    async def delete(self, customer_id: int) -> None: ...


class SqlAlchemyCustomerRepository(SqlAlchemyRepository[CustomerModel], CustomerRepository):
    model = CustomerModel

    async def list_all(self, q: str | None = None) -> list[Customer]:
        statement = select(CustomerModel)
        if q:
            pattern = f"%{q}%"
            statement = statement.where(
                or_(CustomerModel.dni.ilike(pattern), CustomerModel.name.ilike(pattern))
            )
        result = await self._session.execute(statement)
        return [self._to_domain(model) for model in result.scalars().all()]

    async def get_by_id(self, customer_id: int) -> Customer | None:
        model = await self._get_model(customer_id)
        return self._to_domain(model) if model else None

    async def create(self, customer: Customer) -> Customer:
        model = CustomerModel(dni=customer.dni, name=customer.name)
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, customer: Customer) -> Customer:
        model = await self._get_model(customer.id)
        model.dni = customer.dni
        model.name = customer.name
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, customer_id: int) -> None:
        model = await self._get_model(customer_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: CustomerModel) -> Customer:
        return Customer(id=model.id, dni=model.dni, name=model.name)
