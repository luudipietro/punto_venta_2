from decimal import Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.sale import Sale
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.payment_method_repository import (
    PaymentMethodRepository,
    SqlAlchemyPaymentMethodRepository,
)
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.sale_item_repository import SaleItemRepository, SqlAlchemySaleItemRepository
from app.repositories.sale_payment_repository import (
    SalePaymentRepository,
    SqlAlchemySalePaymentRepository,
)
from app.repositories.sale_repository import SaleRepository, SqlAlchemySaleRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.stock_service import StockService


class SaleService:
    """Orchestrates the sale creation transaction: validates totals and stock
    availability, decrements stock, and persists the sale with its items and
    payments as a single unit of work on the shared session."""

    def __init__(
        self,
        sale_repository: SaleRepository,
        sale_item_repository: SaleItemRepository,
        sale_payment_repository: SalePaymentRepository,
        stock_service: StockService,
        payment_method_repository: PaymentMethodRepository,
    ) -> None:
        self._sale_repository = sale_repository
        self._sale_item_repository = sale_item_repository
        self._sale_payment_repository = sale_payment_repository
        self._stock_service = stock_service
        self._payment_method_repository = payment_method_repository

    async def list_all(self) -> list[Sale]:
        return await self._sale_repository.list_all()

    async def get_by_id(self, sale_id: int) -> Sale:
        sale = await self._sale_repository.get_by_id(sale_id)
        if sale is None:
            raise EntityNotFoundError("Sale", sale_id)
        return sale

    async def get_items(self, sale_id: int) -> list[SaleItem]:
        return await self._sale_item_repository.list_by_sale(sale_id)

    async def get_payments(self, sale_id: int) -> list[SalePayment]:
        return await self._sale_payment_repository.list_by_sale(sale_id)

    async def create_sale(
        self,
        branch_id: int,
        discount: Decimal,
        items: list[SaleItem],
        payments: list[SalePayment],
    ) -> Sale:
        subtotal = sum((item.unit_price * item.quantity for item in items), Decimal("0"))
        total = subtotal - discount
        if total < 0:
            raise BusinessRuleViolationError("Discount cannot exceed the sale subtotal")

        paid_total = sum((payment.amount_with_surcharge for payment in payments), Decimal("0"))
        if paid_total != total:
            raise BusinessRuleViolationError(
                f"Payments total ({paid_total}) does not match the sale total ({total})"
            )

        for payment in payments:
            if await self._payment_method_repository.get_by_id(payment.payment_method_id) is None:
                raise EntityNotFoundError("PaymentMethod", payment.payment_method_id)

        sale = await self._sale_repository.create(
            Sale(branch_id=branch_id, subtotal=subtotal, discount=discount, total=total)
        )

        for item in items:
            await self._stock_service.decrease_quantity(item.stock_id, item.quantity)
            item.sale_id = sale.id
            created_item = await self._sale_item_repository.create(item)
            item.id = created_item.id

        for payment in payments:
            payment.sale_id = sale.id
            created_payment = await self._sale_payment_repository.create(payment)
            payment.id = created_payment.id

        return sale


def get_sale_service(session: AsyncSession = Depends(get_db)) -> SaleService:
    return SaleService(
        SqlAlchemySaleRepository(session),
        SqlAlchemySaleItemRepository(session),
        SqlAlchemySalePaymentRepository(session),
        StockService(
            SqlAlchemyStockRepository(session),
            SqlAlchemyProductRepository(session),
            SqlAlchemyColorRepository(session),
            SqlAlchemySizeRepository(session),
            SqlAlchemyBranchRepository(session),
        ),
        SqlAlchemyPaymentMethodRepository(session),
    )
