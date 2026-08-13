from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.sale import Sale
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.payment_method_repository import (
    PaymentMethodRepository,
    SqlAlchemyPaymentMethodRepository,
)
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.repositories.promotion_item_repository import SqlAlchemyPromotionItemRepository
from app.repositories.promotion_repository import SqlAlchemyPromotionRepository
from app.repositories.sale_item_repository import SaleItemRepository, SqlAlchemySaleItemRepository
from app.repositories.sale_payment_repository import (
    SalePaymentRepository,
    SqlAlchemySalePaymentRepository,
)
from app.repositories.sale_repository import SaleRepository, SqlAlchemySaleRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.promotion_service import PromotionService
from app.services.stock_service import StockService


class SaleService:
    """Orchestrates the sale creation transaction: validates totals and stock
    availability, applies any active promotion discounts, decrements stock,
    and persists the sale with its items and payments as a single unit of
    work on the shared session."""

    def __init__(
        self,
        sale_repository: SaleRepository,
        sale_item_repository: SaleItemRepository,
        sale_payment_repository: SalePaymentRepository,
        stock_service: StockService,
        payment_method_repository: PaymentMethodRepository,
        product_repository: ProductRepository,
        promotion_service: PromotionService,
    ) -> None:
        self._sale_repository = sale_repository
        self._sale_item_repository = sale_item_repository
        self._sale_payment_repository = sale_payment_repository
        self._stock_service = stock_service
        self._payment_method_repository = payment_method_repository
        self._product_repository = product_repository
        self._promotion_service = promotion_service

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

    async def compute_totals(
        self,
        branch_id: int,
        discount: Decimal,
        items: list[SaleItem],
        discount_reason: str | None = None,
    ) -> Sale:
        """Resolves cart items to their products, applies winning promotions, and
        returns an unsaved Sale with subtotal/promotion_discount/total computed.
        Mutates each item's `promotion_id` in place to reflect which promotion
        (if any) covers it. Does not touch stock or the database — shared by
        `create_sale` and the read-only preview flow."""
        subtotal = sum((item.unit_price * item.quantity for item in items), Decimal("0"))

        cart_quantities: dict[int, int] = {}
        cart_categories: dict[int, int] = {}
        cart_unit_prices: dict[int, Decimal] = {}
        cart_item_index: dict[int, list[SaleItem]] = {}
        for item in items:
            stock = await self._stock_service.get_by_id(item.stock_id)
            product = await self._product_repository.get_by_id(stock.product_id)
            if product is None:
                raise EntityNotFoundError("Product", stock.product_id)
            cart_quantities[product.id] = cart_quantities.get(product.id, 0) + item.quantity
            cart_categories.setdefault(product.id, product.category_id)
            cart_unit_prices.setdefault(product.id, item.unit_price)
            cart_item_index.setdefault(product.id, []).append(item)

        today = date.today()
        applications = await self._promotion_service.select_winning_applications(
            cart_quantities, cart_categories, cart_unit_prices, today
        )

        promotion_discount = Decimal("0")
        for application in applications:
            remaining_to_consume = application.quantity
            for cart_item in cart_item_index.get(application.product_id, []):
                if remaining_to_consume <= 0:
                    break
                consumed = min(cart_item.quantity, remaining_to_consume)
                if consumed > 0:
                    cart_item.promotion_id = application.promotion_id
                    remaining_to_consume -= consumed
            promotion_discount += application.discount_amount

        total = subtotal - discount - promotion_discount
        if total < 0:
            raise BusinessRuleViolationError("Discount cannot exceed the sale subtotal")

        return Sale(
            branch_id=branch_id,
            subtotal=subtotal,
            discount=discount,
            promotion_discount=promotion_discount,
            discount_reason=discount_reason,
            total=total,
        )

    async def create_sale(
        self,
        branch_id: int,
        discount: Decimal,
        items: list[SaleItem],
        payments: list[SalePayment],
        discount_reason: str | None = None,
    ) -> Sale:
        computed = await self.compute_totals(branch_id, discount, items, discount_reason)

        paid_total = sum((payment.amount_with_surcharge for payment in payments), Decimal("0"))
        if paid_total != computed.total:
            raise BusinessRuleViolationError(
                f"Payments total ({paid_total}) does not match the sale total ({computed.total})"
            )

        for payment in payments:
            if await self._payment_method_repository.get_by_id(payment.payment_method_id) is None:
                raise EntityNotFoundError("PaymentMethod", payment.payment_method_id)

        sale = await self._sale_repository.create(computed)

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

    async def cancel_sale(self, sale_id: int) -> Sale:
        """Cancels a sale in place of editing it: restores the stock each
        SaleItem decremented, then marks the sale cancelled. A cancelled sale
        stays visible in history for the record, but no longer counts toward
        cash balances (see ReportService) and can't be cancelled again."""
        sale = await self.get_by_id(sale_id)
        if sale.cancelled_at is not None:
            raise BusinessRuleViolationError(f"Sale {sale_id} is already cancelled")

        items = await self._sale_item_repository.list_by_sale(sale_id)
        for item in items:
            await self._stock_service.increase_quantity(item.stock_id, item.quantity)

        return await self._sale_repository.mark_cancelled(
            sale_id, datetime.now(UTC).replace(tzinfo=None)
        )


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
        SqlAlchemyProductRepository(session),
        PromotionService(
            SqlAlchemyPromotionRepository(session),
            SqlAlchemyPromotionItemRepository(session),
            SqlAlchemyProductRepository(session),
            SqlAlchemyCategoryRepository(session),
        ),
    )
