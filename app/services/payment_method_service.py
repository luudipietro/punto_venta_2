from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.payment_method import PaymentMethod
from app.infrastructure.db.session import get_db
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.services.base_service import CrudService


class PaymentMethodService(CrudService[PaymentMethod]):
    entity_name = "PaymentMethod"


def get_payment_method_service(
    session: AsyncSession = Depends(get_db),
) -> PaymentMethodService:
    return PaymentMethodService(SqlAlchemyPaymentMethodRepository(session))
