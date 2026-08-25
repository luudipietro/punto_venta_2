from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.payment_method import PaymentMethod
from app.infrastructure.db.session import get_db
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.services.base_service import CrudService


class PaymentMethodService(CrudService[PaymentMethod]):
    entity_name = "PaymentMethod"

    async def delete(self, entity_id: int) -> None:
        try:
            await super().delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: esta forma de pago tiene pagos, compras o gastos asociados"
            ) from exc


def get_payment_method_service(
    session: AsyncSession = Depends(get_db),
) -> PaymentMethodService:
    return PaymentMethodService(SqlAlchemyPaymentMethodRepository(session))
