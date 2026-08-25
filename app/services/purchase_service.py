from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.purchase import Purchase
from app.domain.purchase_item import PurchaseItem
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.payment_method_repository import (
    PaymentMethodRepository,
    SqlAlchemyPaymentMethodRepository,
)
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.repositories.purchase_item_repository import (
    PurchaseItemRepository,
    SqlAlchemyPurchaseItemRepository,
)
from app.repositories.purchase_repository import PurchaseRepository, SqlAlchemyPurchaseRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.stock_service import StockService


class PurchaseService:
    """Orchestrates the purchase creation transaction: computes totals,
    increments stock, updates the product's reference cost, and persists the
    purchase with its items as a single unit of work on the shared session."""

    def __init__(
        self,
        purchase_repository: PurchaseRepository,
        purchase_item_repository: PurchaseItemRepository,
        stock_service: StockService,
        product_repository: ProductRepository,
        payment_method_repository: PaymentMethodRepository,
    ) -> None:
        self._purchase_repository = purchase_repository
        self._purchase_item_repository = purchase_item_repository
        self._stock_service = stock_service
        self._product_repository = product_repository
        self._payment_method_repository = payment_method_repository

    async def list_all(self) -> list[Purchase]:
        return await self._purchase_repository.list_all()

    async def get_by_id(self, purchase_id: int) -> Purchase:
        purchase = await self._purchase_repository.get_by_id(purchase_id)
        if purchase is None:
            raise EntityNotFoundError("Purchase", purchase_id)
        return purchase

    async def get_items(self, purchase_id: int) -> list[PurchaseItem]:
        return await self._purchase_item_repository.list_by_purchase(purchase_id)

    async def create_purchase(
        self,
        branch_id: int,
        supplier_name: str | None,
        items: list[PurchaseItem],
        payment_method_id: int | None = None,
        payment_date: date | None = None,
    ) -> Purchase:
        stocks_by_item = {}
        for item in items:
            stock = await self._stock_service.get_by_id(item.stock_id)
            if stock.branch_id != branch_id:
                raise BusinessRuleViolationError(
                    f"El stock {item.stock_id} pertenece a la sucursal {stock.branch_id}, "
                    f"no a {branch_id}"
                )
            stocks_by_item[item.stock_id] = stock

        if payment_method_id is not None:
            if await self._payment_method_repository.get_by_id(payment_method_id) is None:
                raise EntityNotFoundError("PaymentMethod", payment_method_id)

        subtotal = sum((item.unit_cost * item.quantity for item in items), Decimal("0"))
        total = subtotal
        is_paid = payment_method_id is not None

        purchase = await self._purchase_repository.create(
            Purchase(
                branch_id=branch_id,
                supplier_name=supplier_name,
                subtotal=subtotal,
                total=total,
                payment_method_id=payment_method_id,
                payment_date=(payment_date or date.today()) if is_paid else None,
                is_paid=is_paid,
            )
        )

        for item in items:
            await self._stock_service.increase_quantity(item.stock_id, item.quantity)
            item.purchase_id = purchase.id
            created_item = await self._purchase_item_repository.create(item)
            item.id = created_item.id

            stock = stocks_by_item[item.stock_id]
            product = await self._product_repository.get_by_id(stock.product_id)
            if product is None:
                raise EntityNotFoundError("Product", stock.product_id)
            product.cost = item.unit_cost
            await self._product_repository.update(product)

        return purchase

    async def mark_paid(
        self, purchase_id: int, payment_method_id: int, payment_date: date | None = None
    ) -> Purchase:
        purchase = await self.get_by_id(purchase_id)
        if purchase.is_paid:
            raise BusinessRuleViolationError(f"La compra {purchase_id} ya está pagada")
        if await self._payment_method_repository.get_by_id(payment_method_id) is None:
            raise EntityNotFoundError("PaymentMethod", payment_method_id)
        return await self._purchase_repository.mark_paid(
            purchase_id, payment_method_id, payment_date or date.today()
        )

    async def cancel_purchase(self, purchase_id: int) -> Purchase:
        """Cancels a purchase in place of editing it: reverses the stock each
        PurchaseItem incremented, then marks the purchase cancelled. Doesn't
        revert the reference cost create_purchase may have written onto
        Product (no prior-cost history is kept — accepted limitation)."""
        purchase = await self.get_by_id(purchase_id)
        if purchase.cancelled_at is not None:
            raise BusinessRuleViolationError(f"La compra {purchase_id} ya está cancelada")

        items = await self._purchase_item_repository.list_by_purchase(purchase_id)
        for item in items:
            await self._stock_service.decrease_quantity(item.stock_id, item.quantity)

        return await self._purchase_repository.mark_cancelled(
            purchase_id, datetime.now(UTC).replace(tzinfo=None)
        )


def get_purchase_service(session: AsyncSession = Depends(get_db)) -> PurchaseService:
    return PurchaseService(
        SqlAlchemyPurchaseRepository(session),
        SqlAlchemyPurchaseItemRepository(session),
        StockService(
            SqlAlchemyStockRepository(session),
            SqlAlchemyProductRepository(session),
            SqlAlchemyColorRepository(session),
            SqlAlchemySizeRepository(session),
            SqlAlchemyBranchRepository(session),
        ),
        SqlAlchemyProductRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
    )
