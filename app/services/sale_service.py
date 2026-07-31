from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.promotion import DiscountType, Promotion
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

_CENTS = Decimal("0.01")


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

    async def create_sale(
        self,
        branch_id: int,
        discount: Decimal,
        items: list[SaleItem],
        payments: list[SalePayment],
    ) -> Sale:
        subtotal = sum((item.unit_price * item.quantity for item in items), Decimal("0"))

        promotion_discount = Decimal("0")
        today = date.today()
        for item in items:
            stock = await self._stock_service.get_by_id(item.stock_id)
            product = await self._product_repository.get_by_id(stock.product_id)
            if product is None:
                raise EntityNotFoundError("Product", stock.product_id)
            promotion = await self._promotion_service.find_applicable(
                product.id, product.category_id, today
            )
            if promotion is not None:
                promotion_discount += self._compute_item_discount(promotion, item)

        total = subtotal - discount - promotion_discount
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
            Sale(
                branch_id=branch_id,
                subtotal=subtotal,
                discount=discount,
                promotion_discount=promotion_discount,
                total=total,
            )
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

    @staticmethod
    def _compute_item_discount(promotion: Promotion, item: SaleItem) -> Decimal:
        line_subtotal = item.unit_price * item.quantity
        if promotion.discount_type == DiscountType.PERCENTAGE:
            raw_discount = line_subtotal * promotion.discount_value / Decimal("100")
        else:
            raw_discount = min(promotion.discount_value * item.quantity, line_subtotal)
        return raw_discount.quantize(_CENTS, rounding=ROUND_HALF_UP)


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
            SqlAlchemyProductRepository(session),
            SqlAlchemyCategoryRepository(session),
        ),
    )
