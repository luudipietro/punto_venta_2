from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, InsufficientStockError
from app.domain.branch import Branch
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.color import Color
from app.domain.payment_method import PaymentMethod
from app.domain.product import Product
from app.domain.purchase_item import PurchaseItem
from app.domain.size import Size
from app.domain.stock import Stock
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.purchase_item_repository import SqlAlchemyPurchaseItemRepository
from app.repositories.purchase_repository import SqlAlchemyPurchaseRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.purchase_service import PurchaseService
from app.services.stock_service import StockService


async def _seed_stock(session: AsyncSession, quantity: int) -> Stock:
    category = await SqlAlchemyCategoryRepository(session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(session).create(Brand(name="Nike"))
    color = await SqlAlchemyColorRepository(session).create(Color(name="Negro"))
    size = await SqlAlchemySizeRepository(session).create(Size(label="M"))
    branch = await SqlAlchemyBranchRepository(session).create(Branch(name="Central"))
    product = await SqlAlchemyProductRepository(session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10.00"),
            price=Decimal("20.00"),
        )
    )
    return await SqlAlchemyStockRepository(session).create(
        Stock(
            product_id=product.id,
            color_id=color.id,
            size_id=size.id,
            branch_id=branch.id,
            quantity=quantity,
        )
    )


def _build_purchase_service(session: AsyncSession) -> PurchaseService:
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


async def test_create_purchase_increments_stock(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    service = _build_purchase_service(db_session)

    purchase = await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name="Distribuidora Sur",
        items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("10.00"))],
    )

    assert purchase.subtotal == Decimal("30.00")
    assert purchase.total == Decimal("30.00")
    updated_stock = await SqlAlchemyStockRepository(db_session).get_by_id(stock.id)
    assert updated_stock is not None
    assert updated_stock.quantity == 8


async def test_create_purchase_with_multiple_items_sums_subtotal(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=0)
    service = _build_purchase_service(db_session)

    purchase = await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name=None,
        items=[
            PurchaseItem(stock_id=stock.id, quantity=2, unit_cost=Decimal("10.00")),
            PurchaseItem(stock_id=stock.id, quantity=1, unit_cost=Decimal("12.50")),
        ],
    )

    assert purchase.subtotal == Decimal("32.50")
    updated_stock = await SqlAlchemyStockRepository(db_session).get_by_id(stock.id)
    assert updated_stock is not None
    assert updated_stock.quantity == 3


async def test_create_purchase_rejects_stock_from_a_different_branch(
    db_session: AsyncSession,
) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    other_branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Sucursal 2"))
    service = _build_purchase_service(db_session)

    with pytest.raises(BusinessRuleViolationError):
        await service.create_purchase(
            branch_id=other_branch.id,
            supplier_name=None,
            items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("10.00"))],
        )

    unchanged_stock = await SqlAlchemyStockRepository(db_session).get_by_id(stock.id)
    assert unchanged_stock is not None
    assert unchanged_stock.quantity == 5


async def test_create_purchase_updates_product_cost(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    service = _build_purchase_service(db_session)

    await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("15.00"))],
    )

    updated_product = await SqlAlchemyProductRepository(db_session).get_by_id(stock.product_id)
    assert updated_product is not None
    assert updated_product.cost == Decimal("15.00")


async def test_create_purchase_with_payment_method_marks_paid(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )
    service = _build_purchase_service(db_session)

    purchase = await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("10.00"))],
        payment_method_id=cash.id,
        payment_date=date(2026, 1, 5),
    )

    assert purchase.is_paid is True
    assert purchase.payment_method_id == cash.id
    assert purchase.payment_date == date(2026, 1, 5)


async def test_create_purchase_without_payment_method_is_unpaid(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    service = _build_purchase_service(db_session)

    purchase = await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("10.00"))],
    )

    assert purchase.is_paid is False
    assert purchase.payment_method_id is None
    assert purchase.payment_date is None


async def test_mark_paid_on_unpaid_purchase(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )
    service = _build_purchase_service(db_session)
    purchase = await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("10.00"))],
    )

    paid = await service.mark_paid(purchase.id, cash.id, date(2026, 1, 10))

    assert paid.is_paid is True
    assert paid.payment_method_id == cash.id
    assert paid.payment_date == date(2026, 1, 10)


async def test_mark_paid_twice_raises(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )
    service = _build_purchase_service(db_session)
    purchase = await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("10.00"))],
        payment_method_id=cash.id,
    )

    with pytest.raises(BusinessRuleViolationError):
        await service.mark_paid(purchase.id, cash.id, date(2026, 1, 10))


async def test_cancel_purchase_reverses_stock(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    service = _build_purchase_service(db_session)
    purchase = await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("10.00"))],
    )
    updated_stock = await SqlAlchemyStockRepository(db_session).get_by_id(stock.id)
    assert updated_stock is not None
    assert updated_stock.quantity == 8

    cancelled = await service.cancel_purchase(purchase.id)

    assert cancelled.cancelled_at is not None
    restored_stock = await SqlAlchemyStockRepository(db_session).get_by_id(stock.id)
    assert restored_stock is not None
    assert restored_stock.quantity == 5


async def test_cancel_already_cancelled_purchase_raises(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    service = _build_purchase_service(db_session)
    purchase = await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("10.00"))],
    )
    await service.cancel_purchase(purchase.id)

    with pytest.raises(BusinessRuleViolationError):
        await service.cancel_purchase(purchase.id)


async def test_cancel_purchase_with_insufficient_stock_raises(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    service = _build_purchase_service(db_session)
    purchase = await service.create_purchase(
        branch_id=stock.branch_id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=3, unit_cost=Decimal("10.00"))],
    )
    # Sell off the stock the purchase brought in, so cancelling can't reverse it.
    await StockService(
        SqlAlchemyStockRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyColorRepository(db_session),
        SqlAlchemySizeRepository(db_session),
        SqlAlchemyBranchRepository(db_session),
    ).decrease_quantity(stock.id, 7)

    with pytest.raises(InsufficientStockError):
        await service.cancel_purchase(purchase.id)
