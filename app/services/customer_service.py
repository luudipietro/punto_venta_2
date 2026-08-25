from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.customer import Customer
from app.infrastructure.db.session import get_db
from app.repositories.customer_repository import CustomerRepository, SqlAlchemyCustomerRepository
from app.services.base_service import CrudService


class CustomerService(CrudService[Customer]):
    entity_name = "Customer"

    def __init__(self, repository: CustomerRepository) -> None:
        super().__init__(repository)
        self._repository: CustomerRepository = repository

    async def list_all(self, q: str | None = None) -> list[Customer]:
        return await self._repository.list_all(q)

    async def create(self, customer: Customer) -> Customer:
        try:
            return await super().create(customer)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                f"Ya existe un cliente con DNI {customer.dni}"
            ) from exc

    async def update(self, entity_id: int, customer: Customer) -> Customer:
        try:
            return await super().update(entity_id, customer)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                f"Ya existe un cliente con DNI {customer.dni}"
            ) from exc

    async def delete(self, entity_id: int) -> None:
        try:
            await super().delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: este cliente tiene ventas asociadas"
            ) from exc


def get_customer_service(session: AsyncSession = Depends(get_db)) -> CustomerService:
    return CustomerService(SqlAlchemyCustomerRepository(session))
