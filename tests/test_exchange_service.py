from decimal import Decimal
from itertools import count

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BusinessRuleViolationError,
    EntityNotFoundError,
    InsufficientStockError,
)
from app.domain.branch import Branch
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.color import Color
from app.domain.exchange_new_item import ExchangeNewItem
from app.domain.exchange_payment import ExchangePayment
from app.domain.exchange_return_item import ExchangeReturnItem
from app.domain.payment_method import PaymentMethod
from app.domain.product import Product
from app.domain.sale import Sale
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.domain.size import Size
from app.domain.stock import Stock
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.customer_repository import SqlAlchemyCustomerRepository
from app.repositories.exchange_new_item_repository import SqlAlchemyExchangeNewItemRepository
from app.repositories.exchange_payment_repository import SqlAlchemyExchangePaymentRepository
from app.repositories.exchange_repository import SqlAlchemyExchangeRepository
from app.repositories.exchange_return_item_repository import (
    SqlAlchemyExchangeReturnItemRepository,
)
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.promotion_item_repository import SqlAlchemyPromotionItemRepository
from app.repositories.promotion_repository import SqlAlchemyPromotionRepository
from app.repositories.sale_item_repository import SqlAlchemySaleItemRepository
from app.repositories.sale_payment_repository import SqlAlchemySalePaymentRepository
from app.repositories.sale_repository import SqlAlchemySaleRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.exchange_service import ExchangeService
from app.services.promotion_service import PromotionService
from app.services.sale_service import SaleService
from app.services.stock_service import StockService

_stock_counter = count()


async def _seed_stock(session: AsyncSession, quantity: int, *, price: Decimal) -> Stock:
    suffix = next(_stock_counter)
    category = await SqlAlchemyCategoryRepository(session).create(Category(name=f"Ropa {suffix}"))
    brand = await SqlAlchemyBrandRepository(session).create(Brand(name=f"Nike {suffix}"))
    color = await SqlAlchemyColorRepository(session).create(Color(name=f"Negro {suffix}"))
    size = await SqlAlchemySizeRepository(session).create(Size(label=f"M{suffix}"))
    branch = await SqlAlchemyBranchRepository(session).create(Branch(name=f"Central {suffix}"))
    product = await SqlAlchemyProductRepository(session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10.00"),
            price=price,
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


def _build_sale_service(session: AsyncSession) -> SaleService:
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
    )


def _build_exchange_service(session: AsyncSession) -> ExchangeService:
    return ExchangeService(
        SqlAlchemyExchangeRepository(session),
        SqlAlchemyExchangeReturnItemRepository(session),
        SqlAlchemyExchangeNewItemRepository(session),
        SqlAlchemyExchangePaymentRepository(session),
        StockService(
            SqlAlchemyStockRepository(session),
            SqlAlchemyProductRepository(session),
            SqlAlchemyColorRepository(session),
            SqlAlchemySizeRepository(session),
            SqlAlchemyBranchRepository(session),
        ),
        SqlAlchemySaleRepository(session),
        SqlAlchemySaleItemRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
    )


async def _make_sale(
    session: AsyncSession, stock: Stock, quantity: int, unit_price: Decimal
) -> tuple[Sale, PaymentMethod]:
    payment_method = await SqlAlchemyPaymentMethodRepository(session).create(
        PaymentMethod(name="Efectivo")
    )
    sale_service = _build_sale_service(session)
    total = unit_price * quantity
    sale = await sale_service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=quantity, unit_price=unit_price)],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=total,
                amount_with_surcharge=total,
            )
        ],
    )
    return sale, payment_method


async def test_pure_return_refunds_and_restocks(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5, price=Decimal("20.00"))
    sale, payment_method = await _make_sale(
        db_session, stock, quantity=3, unit_price=Decimal("20.00")
    )
    service = _build_exchange_service(db_session)

    exchange = await service.create_exchange(
        sale_id=sale.id,
        returned_items=[
            ExchangeReturnItem(stock_id=stock.id, quantity=2, unit_price=Decimal("20.00"))
        ],
        new_items=[],
        payments=[ExchangePayment(payment_method_id=payment_method.id, amount=Decimal("-40.00"))],
    )

    assert exchange.id is not None
    updated_stock = await SqlAlchemyStockRepository(db_session).get_by_id(stock.id)
    assert updated_stock is not None
    assert updated_stock.quantity == 4  # 5 - 3 sold + 2 returned


async def test_exchange_with_more_expensive_new_item_requires_positive_payment(
    db_session: AsyncSession,
) -> None:
    old_stock = await _seed_stock(db_session, quantity=5, price=Decimal("20.00"))
    new_stock = await _seed_stock(db_session, quantity=5, price=Decimal("35.00"))
    sale, payment_method = await _make_sale(
        db_session, old_stock, quantity=1, unit_price=Decimal("20.00")
    )
    service = _build_exchange_service(db_session)

    exchange = await service.create_exchange(
        sale_id=sale.id,
        returned_items=[
            ExchangeReturnItem(stock_id=old_stock.id, quantity=1, unit_price=Decimal("20.00"))
        ],
        new_items=[ExchangeNewItem(stock_id=new_stock.id, quantity=1, unit_price=Decimal("35.00"))],
        payments=[ExchangePayment(payment_method_id=payment_method.id, amount=Decimal("15.00"))],
    )

    assert exchange.id is not None
    old_updated = await SqlAlchemyStockRepository(db_session).get_by_id(old_stock.id)
    new_updated = await SqlAlchemyStockRepository(db_session).get_by_id(new_stock.id)
    assert old_updated.quantity == 5  # 5 - 1 sold + 1 returned
    assert new_updated.quantity == 4  # 5 - 1 given in exchange


async def test_exchange_payments_mismatch_raises_business_rule_violation(
    db_session: AsyncSession,
) -> None:
    stock = await _seed_stock(db_session, quantity=5, price=Decimal("20.00"))
    sale, payment_method = await _make_sale(
        db_session, stock, quantity=1, unit_price=Decimal("20.00")
    )
    service = _build_exchange_service(db_session)

    with pytest.raises(BusinessRuleViolationError):
        await service.create_exchange(
            sale_id=sale.id,
            returned_items=[
                ExchangeReturnItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))
            ],
            new_items=[],
            payments=[
                ExchangePayment(payment_method_id=payment_method.id, amount=Decimal("-10.00"))
            ],
        )


async def test_exchange_returning_item_not_in_sale_raises_business_rule_violation(
    db_session: AsyncSession,
) -> None:
    stock = await _seed_stock(db_session, quantity=5, price=Decimal("20.00"))
    other_stock = await _seed_stock(db_session, quantity=5, price=Decimal("20.00"))
    sale, _ = await _make_sale(db_session, stock, quantity=1, unit_price=Decimal("20.00"))
    service = _build_exchange_service(db_session)

    with pytest.raises(BusinessRuleViolationError):
        await service.create_exchange(
            sale_id=sale.id,
            returned_items=[
                ExchangeReturnItem(stock_id=other_stock.id, quantity=1, unit_price=Decimal("20.00"))
            ],
            new_items=[],
            payments=[],
        )


async def test_exchange_returning_more_than_sold_raises_business_rule_violation(
    db_session: AsyncSession,
) -> None:
    stock = await _seed_stock(db_session, quantity=5, price=Decimal("20.00"))
    sale, _ = await _make_sale(db_session, stock, quantity=1, unit_price=Decimal("20.00"))
    service = _build_exchange_service(db_session)

    with pytest.raises(BusinessRuleViolationError):
        await service.create_exchange(
            sale_id=sale.id,
            returned_items=[
                ExchangeReturnItem(stock_id=stock.id, quantity=2, unit_price=Decimal("20.00"))
            ],
            new_items=[],
            payments=[],
        )


async def test_exchange_insufficient_stock_for_new_item_raises_insufficient_stock_error(
    db_session: AsyncSession,
) -> None:
    old_stock = await _seed_stock(db_session, quantity=5, price=Decimal("20.00"))
    new_stock = await _seed_stock(db_session, quantity=0, price=Decimal("20.00"))
    sale, payment_method = await _make_sale(
        db_session, old_stock, quantity=1, unit_price=Decimal("20.00")
    )
    service = _build_exchange_service(db_session)

    with pytest.raises(InsufficientStockError):
        await service.create_exchange(
            sale_id=sale.id,
            returned_items=[
                ExchangeReturnItem(stock_id=old_stock.id, quantity=1, unit_price=Decimal("20.00"))
            ],
            new_items=[
                ExchangeNewItem(stock_id=new_stock.id, quantity=1, unit_price=Decimal("20.00"))
            ],
            payments=[ExchangePayment(payment_method_id=payment_method.id, amount=Decimal("0.00"))],
        )


async def test_exchange_unknown_sale_raises_entity_not_found(db_session: AsyncSession) -> None:
    service = _build_exchange_service(db_session)

    with pytest.raises(EntityNotFoundError):
        await service.create_exchange(
            sale_id=999,
            returned_items=[
                ExchangeReturnItem(stock_id=1, quantity=1, unit_price=Decimal("20.00"))
            ],
            new_items=[],
            payments=[],
        )


async def test_exchange_cannot_return_the_same_unit_twice_across_exchanges(
    db_session: AsyncSession,
) -> None:
    """Regression test: sell 1 unit, exchange it away (returning it restocks
    it), then try to return "the same sold unit" again in a second Exchange
    against the same sale — this used to succeed and double-restock, letting
    stock drift upward with every repeated exchange on the same sale."""
    old_stock = await _seed_stock(db_session, quantity=10, price=Decimal("20.00"))
    new_stock = await _seed_stock(db_session, quantity=15, price=Decimal("20.00"))
    sale, payment_method = await _make_sale(
        db_session, old_stock, quantity=1, unit_price=Decimal("20.00")
    )
    service = _build_exchange_service(db_session)

    await service.create_exchange(
        sale_id=sale.id,
        returned_items=[
            ExchangeReturnItem(stock_id=old_stock.id, quantity=1, unit_price=Decimal("20.00"))
        ],
        new_items=[ExchangeNewItem(stock_id=new_stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[ExchangePayment(payment_method_id=payment_method.id, amount=Decimal("0.00"))],
    )

    with pytest.raises(BusinessRuleViolationError):
        await service.create_exchange(
            sale_id=sale.id,
            returned_items=[
                ExchangeReturnItem(stock_id=old_stock.id, quantity=1, unit_price=Decimal("20.00"))
            ],
            new_items=[
                ExchangeNewItem(stock_id=new_stock.id, quantity=1, unit_price=Decimal("20.00"))
            ],
            payments=[ExchangePayment(payment_method_id=payment_method.id, amount=Decimal("0.00"))],
        )

    old_updated = await SqlAlchemyStockRepository(db_session).get_by_id(old_stock.id)
    new_updated = await SqlAlchemyStockRepository(db_session).get_by_id(new_stock.id)
    assert old_updated.quantity == 10  # 10 - 1 sold + 1 returned, second exchange rejected
    assert new_updated.quantity == 14  # 15 - 1 given, second exchange rejected
