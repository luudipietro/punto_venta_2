from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BusinessRuleViolationError,
    EntityNotFoundError,
    PermissionDeniedError,
)
from app.domain.sale import Sale
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.domain.user import User
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.customer_repository import CustomerRepository, SqlAlchemyCustomerRepository
from app.repositories.exchange_new_item_repository import (
    ExchangeNewItemRepository,
    SqlAlchemyExchangeNewItemRepository,
)
from app.repositories.exchange_return_item_repository import (
    ExchangeReturnItemRepository,
    SqlAlchemyExchangeReturnItemRepository,
)
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
from app.services.audit_log_service import AuditLogService, get_audit_log_service
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
        customer_repository: CustomerRepository,
        exchange_return_item_repository: ExchangeReturnItemRepository,
        exchange_new_item_repository: ExchangeNewItemRepository,
        audit: AuditLogService | None = None,
    ) -> None:
        self._sale_repository = sale_repository
        self._sale_item_repository = sale_item_repository
        self._sale_payment_repository = sale_payment_repository
        self._stock_service = stock_service
        self._payment_method_repository = payment_method_repository
        self._product_repository = product_repository
        self._promotion_service = promotion_service
        self._customer_repository = customer_repository
        self._exchange_return_item_repository = exchange_return_item_repository
        self._exchange_new_item_repository = exchange_new_item_repository
        self._audit = audit

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

    async def get_items_summary(self, sale_id: int) -> str:
        """Human-readable summary of what was sold, e.g. "Remera Nike x2,
        Pantalón Cargo" — used by the sales list instead of a bare "Venta #N",
        since the id means nothing to a cashier. Resolves each item's product
        the same way compute_totals does, preserving cart order and deduping
        repeated purchases of the same product."""
        items = await self.get_items(sale_id)

        product_names: dict[int, str] = {}
        product_order: list[int] = []
        product_quantities: dict[int, int] = {}
        for item in items:
            stock = await self._stock_service.get_by_id(item.stock_id)
            product = await self._product_repository.get_by_id(stock.product_id)
            if product is None:
                raise EntityNotFoundError("Product", stock.product_id)
            if product.id not in product_quantities:
                product_order.append(product.id)
                product_names[product.id] = product.name
            product_quantities[product.id] = product_quantities.get(product.id, 0) + item.quantity

        def label(product_id: int) -> str:
            name = product_names[product_id]
            quantity = product_quantities[product_id]
            return f"{name} x{quantity}" if quantity > 1 else name

        shown = product_order[:2]
        summary = ", ".join(label(product_id) for product_id in shown)
        remaining = len(product_order) - len(shown)
        if remaining > 0:
            summary += f" y {remaining} más"
        return summary

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
            raise BusinessRuleViolationError(
                "El descuento no puede superar el subtotal de la venta"
            )

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
        customer_id: int | None = None,
        *,
        acting_branch_id: int | None = None,
        acting_user: User | None = None,
    ) -> Sale:
        if acting_branch_id is not None and branch_id != acting_branch_id:
            raise PermissionDeniedError("No podés registrar ventas para otra sucursal")
        computed = await self.compute_totals(branch_id, discount, items, discount_reason)
        if customer_id is not None:
            if await self._customer_repository.get_by_id(customer_id) is None:
                raise EntityNotFoundError("Customer", customer_id)
            computed.customer_id = customer_id

        # amount_with_surcharge is what's actually charged (e.g. on the card
        # terminal); amount_without_surcharge is how much of the sale that
        # payment covers net of the payment method's surcharge. It's the net
        # amounts that must add up to the sale total, not the gross ones.
        paid_total = sum((payment.amount_without_surcharge for payment in payments), Decimal("0"))
        if paid_total != computed.total:
            raise BusinessRuleViolationError(
                f"El total de pagos ({paid_total}) no coincide con el total de la venta "
                f"({computed.total})"
            )

        for payment in payments:
            method = await self._payment_method_repository.get_by_id(payment.payment_method_id)
            if method is None:
                raise EntityNotFoundError("PaymentMethod", payment.payment_method_id)
            expected_without_surcharge = (
                payment.amount_with_surcharge / (1 + method.surcharge_percentage / Decimal("100"))
            ).quantize(Decimal("0.01"))
            if expected_without_surcharge != payment.amount_without_surcharge:
                raise BusinessRuleViolationError(
                    f"El recargo del pago no coincide para el método {method.id}: "
                    f"se esperaba {expected_without_surcharge}, se recibió "
                    f"{payment.amount_without_surcharge}"
                )

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

        if self._audit is not None:
            await self._audit.record(
                acting_user,
                "sale.create",
                "Sale",
                sale.id,
                branch_id=sale.branch_id,
                summary=f"Registró la venta #{sale.id} por ${sale.total}",
            )

        return sale

    async def cancel_sale(
        self,
        sale_id: int,
        *,
        acting_branch_id: int | None = None,
        acting_user: User | None = None,
    ) -> Sale:
        """Cancels a sale in place of editing it: restores stock, then marks
        the sale cancelled. A cancelled sale stays visible in history for the
        record, but no longer counts toward cash balances (see ReportService)
        and can't be cancelled again.

        Restoring stock has to account for any (non-cancelled) Exchange
        against this sale, not just the original SaleItems — otherwise
        cancelling a sale that was later exchanged (e.g. size M sold, then
        exchanged for size L) would restore the *original* M a second time
        (it was already restored when the exchange happened) while never
        giving back the L the customer is actually holding. The correct
        restoration per stock_id is: originally sold - already returned via
        exchange + given as a new item via exchange, which nets out to
        exactly what's currently "out" with the customer."""
        sale = await self.get_by_id(sale_id)
        if acting_branch_id is not None and sale.branch_id != acting_branch_id:
            raise PermissionDeniedError("No podés cancelar una venta de otra sucursal")
        if sale.cancelled_at is not None:
            raise BusinessRuleViolationError(f"La venta {sale_id} ya está cancelada")

        net_restore: dict[int, int] = {}
        for item in await self._sale_item_repository.list_by_sale(sale_id):
            net_restore[item.stock_id] = net_restore.get(item.stock_id, 0) + item.quantity
        for returned in await self._exchange_return_item_repository.list_by_sale(sale_id):
            net_restore[returned.stock_id] = (
                net_restore.get(returned.stock_id, 0) - returned.quantity
            )
        for given in await self._exchange_new_item_repository.list_by_sale(sale_id):
            net_restore[given.stock_id] = net_restore.get(given.stock_id, 0) + given.quantity

        for stock_id, quantity in net_restore.items():
            if quantity > 0:
                await self._stock_service.increase_quantity(stock_id, quantity)
            elif quantity < 0:
                await self._stock_service.decrease_quantity(stock_id, -quantity)

        cancelled = await self._sale_repository.mark_cancelled(
            sale_id, datetime.now(UTC).replace(tzinfo=None)
        )
        if self._audit is not None:
            await self._audit.record(
                acting_user,
                "sale.cancel",
                "Sale",
                sale_id,
                branch_id=sale.branch_id,
                summary=f"Canceló la venta #{sale_id}",
            )
        return cancelled


def get_sale_service(
    session: AsyncSession = Depends(get_db),
    audit: AuditLogService = Depends(get_audit_log_service),
) -> SaleService:
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
        SqlAlchemyCustomerRepository(session),
        SqlAlchemyExchangeReturnItemRepository(session),
        SqlAlchemyExchangeNewItemRepository(session),
        audit,
    )
