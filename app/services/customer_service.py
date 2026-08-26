from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.customer import Customer
from app.domain.user import User
from app.infrastructure.db.session import get_db
from app.repositories.customer_repository import CustomerRepository, SqlAlchemyCustomerRepository
from app.services.audit_log_service import AuditLogService, get_audit_log_service
from app.services.base_service import CrudService


class CustomerService(CrudService[Customer]):
    entity_name = "Customer"

    def __init__(
        self, repository: CustomerRepository, audit: AuditLogService | None = None
    ) -> None:
        super().__init__(repository, audit)
        self._repository: CustomerRepository = repository

    async def list_all(self, q: str | None = None) -> list[Customer]:
        return await self._repository.list_all(q)

    async def create(self, customer: Customer, *, acting_user: User | None = None) -> Customer:
        try:
            return await super().create(customer, acting_user=acting_user)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                f"Ya existe un cliente con DNI {customer.dni}"
            ) from exc

    async def update(
        self, entity_id: int, customer: Customer, *, acting_user: User | None = None
    ) -> Customer:
        existing = await self.get_by_id(entity_id)
        if customer.dni != existing.dni:
            raise BusinessRuleViolationError(
                "El DNI no se puede modificar una vez creado el cliente"
            )
        try:
            return await super().update(entity_id, customer, acting_user=acting_user)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                f"Ya existe un cliente con DNI {customer.dni}"
            ) from exc

    async def delete(self, entity_id: int, *, acting_user: User | None = None) -> None:
        try:
            await super().delete(entity_id, acting_user=acting_user)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: este cliente tiene ventas asociadas"
            ) from exc


def get_customer_service(
    session: AsyncSession = Depends(get_db),
    audit: AuditLogService = Depends(get_audit_log_service),
) -> CustomerService:
    return CustomerService(SqlAlchemyCustomerRepository(session), audit)
