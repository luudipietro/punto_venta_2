from datetime import date, timedelta
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
from app.domain.promotion import DiscountType, Promotion
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.domain.size import Size
from app.domain.stock import Stock
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.promotion_repository import SqlAlchemyPromotionRepository
from app.repositories.sale_item_repository import SqlAlchemySaleItemRepository
from app.repositories.sale_payment_repository import SqlAlchemySalePaymentRepository
from app.repositories.sale_repository import SqlAlchemySaleRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.promotion_service import PromotionService
from app.services.sale_service import SaleService
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


async def _seed_stock_with_product(session: AsyncSession, quantity: int) -> tuple[Stock, Product]:
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
    stock = await SqlAlchemyStockRepository(session).create(
        Stock(
            product_id=product.id,
            color_id=color.id,
            size_id=size.id,
            branch_id=branch.id,
            quantity=quantity,
        )
    )
    return stock, product


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
            SqlAlchemyProductRepository(session),
            SqlAlchemyCategoryRepository(session),
        ),
    )


async def test_create_sale_decrements_stock(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=2, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("40.00"),
                amount_with_surcharge=Decimal("40.00"),
            )
        ],
    )

    assert sale.total == Decimal("40.00")
    updated_stock = await SqlAlchemyStockRepository(db_session).get_by_id(stock.id)
    assert updated_stock is not None
    assert updated_stock.quantity == 3


async def test_create_sale_with_insufficient_stock_raises(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=1)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    service = _build_sale_service(db_session)

    with pytest.raises(InsufficientStockError):
        await service.create_sale(
            branch_id=stock.branch_id,
            discount=Decimal("0"),
            items=[SaleItem(stock_id=stock.id, quantity=5, unit_price=Decimal("20.00"))],
            payments=[
                SalePayment(
                    payment_method_id=payment_method.id,
                    amount_without_surcharge=Decimal("100.00"),
                    amount_with_surcharge=Decimal("100.00"),
                )
            ],
        )


async def test_create_sale_applies_percentage_promotion(db_session: AsyncSession) -> None:
    stock, product = await _seed_stock_with_product(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = PromotionService(
        SqlAlchemyPromotionRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyCategoryRepository(db_session),
    )
    await promotion_service.create(
        Promotion(
            name="10% Remeras",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10"),
            start_date=today,
            end_date=today,
            product_id=product.id,
        )
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=2, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("36.00"),
                amount_with_surcharge=Decimal("36.00"),
            )
        ],
    )

    assert sale.promotion_discount == Decimal("4.00")
    assert sale.total == Decimal("36.00")


async def test_create_sale_promotion_payment_mismatch_at_old_total_raises(
    db_session: AsyncSession,
) -> None:
    stock, product = await _seed_stock_with_product(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = PromotionService(
        SqlAlchemyPromotionRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyCategoryRepository(db_session),
    )
    await promotion_service.create(
        Promotion(
            name="10% Remeras",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10"),
            start_date=today,
            end_date=today,
            product_id=product.id,
        )
    )
    service = _build_sale_service(db_session)

    with pytest.raises(BusinessRuleViolationError):
        await service.create_sale(
            branch_id=stock.branch_id,
            discount=Decimal("0"),
            items=[SaleItem(stock_id=stock.id, quantity=2, unit_price=Decimal("20.00"))],
            payments=[
                SalePayment(
                    payment_method_id=payment_method.id,
                    amount_without_surcharge=Decimal("40.00"),
                    amount_with_surcharge=Decimal("40.00"),
                )
            ],
        )


async def test_create_sale_applies_fixed_amount_promotion_capped(db_session: AsyncSession) -> None:
    stock, product = await _seed_stock_with_product(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = PromotionService(
        SqlAlchemyPromotionRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyCategoryRepository(db_session),
    )
    await promotion_service.create(
        Promotion(
            name="Descuento fijo grande",
            discount_type=DiscountType.FIXED_AMOUNT,
            discount_value=Decimal("50.00"),
            start_date=today,
            end_date=today,
            product_id=product.id,
        )
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("0.00"),
                amount_with_surcharge=Decimal("0.00"),
            )
        ],
    )

    assert sale.promotion_discount == Decimal("20.00")
    assert sale.total == Decimal("0.00")


async def test_create_sale_promotion_targeting_category_matches(db_session: AsyncSession) -> None:
    stock, product = await _seed_stock_with_product(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = PromotionService(
        SqlAlchemyPromotionRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyCategoryRepository(db_session),
    )
    await promotion_service.create(
        Promotion(
            name="10% Categoria",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10"),
            start_date=today,
            end_date=today,
            category_id=product.category_id,
        )
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("18.00"),
                amount_with_surcharge=Decimal("18.00"),
            )
        ],
    )

    assert sale.promotion_discount == Decimal("2.00")


async def test_create_sale_promotion_outside_date_range_not_applied(
    db_session: AsyncSession,
) -> None:
    stock, product = await _seed_stock_with_product(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = PromotionService(
        SqlAlchemyPromotionRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyCategoryRepository(db_session),
    )
    await promotion_service.create(
        Promotion(
            name="Vencida",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10"),
            start_date=today - timedelta(days=10),
            end_date=today - timedelta(days=1),
            product_id=product.id,
        )
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("20.00"),
                amount_with_surcharge=Decimal("20.00"),
            )
        ],
    )

    assert sale.promotion_discount == Decimal("0")
    assert sale.total == Decimal("20.00")


async def test_create_sale_with_manual_discount_and_promotion_discount_both_apply(
    db_session: AsyncSession,
) -> None:
    stock, product = await _seed_stock_with_product(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = PromotionService(
        SqlAlchemyPromotionRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyCategoryRepository(db_session),
    )
    await promotion_service.create(
        Promotion(
            name="10% Remeras",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10"),
            start_date=today,
            end_date=today,
            product_id=product.id,
        )
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("5.00"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("13.00"),
                amount_with_surcharge=Decimal("13.00"),
            )
        ],
    )

    assert sale.discount == Decimal("5.00")
    assert sale.promotion_discount == Decimal("2.00")
    assert sale.total == Decimal("13.00")
