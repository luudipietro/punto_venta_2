from datetime import date, timedelta
from decimal import Decimal

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
from app.domain.customer import Customer
from app.domain.payment_method import PaymentMethod
from app.domain.product import Product
from app.domain.promotion import DiscountType, Promotion
from app.domain.promotion_item import PromotionItem
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.domain.size import Size
from app.domain.stock import Stock
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.customer_repository import SqlAlchemyCustomerRepository
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.promotion_item_repository import SqlAlchemyPromotionItemRepository
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


async def _seed_stock_with_product(
    session: AsyncSession, quantity: int, name: str = "Remera"
) -> tuple[Stock, Product]:
    category = await SqlAlchemyCategoryRepository(session).create(Category(name=f"{name}-cat"))
    brand = await SqlAlchemyBrandRepository(session).create(Brand(name=f"{name}-brand"))
    color = await SqlAlchemyColorRepository(session).create(Color(name="Negro"))
    size = await SqlAlchemySizeRepository(session).create(Size(label="M"))
    branch = await SqlAlchemyBranchRepository(session).create(Branch(name="Central"))
    product = await SqlAlchemyProductRepository(session).create(
        Product(
            name=name,
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


async def _seed_stock_for_product_in_branch(
    session: AsyncSession, product: Product, branch: Branch, quantity: int
) -> Stock:
    color = await SqlAlchemyColorRepository(session).create(Color(name=f"Color-{product.id}"))
    size = await SqlAlchemySizeRepository(session).create(Size(label=f"Talle-{product.id}"))
    return await SqlAlchemyStockRepository(session).create(
        Stock(
            product_id=product.id,
            color_id=color.id,
            size_id=size.id,
            branch_id=branch.id,
            quantity=quantity,
        )
    )


def _build_promotion_service(session: AsyncSession) -> PromotionService:
    return PromotionService(
        SqlAlchemyPromotionRepository(session),
        SqlAlchemyPromotionItemRepository(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyCategoryRepository(session),
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
        _build_promotion_service(session),
        SqlAlchemyCustomerRepository(session),
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


async def test_cancel_sale_restores_stock_and_marks_cancelled(db_session: AsyncSession) -> None:
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

    cancelled = await service.cancel_sale(sale.id)

    assert cancelled.cancelled_at is not None
    updated_stock = await SqlAlchemyStockRepository(db_session).get_by_id(stock.id)
    assert updated_stock is not None
    assert updated_stock.quantity == 5


async def test_cancel_already_cancelled_sale_raises(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
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
    await service.cancel_sale(sale.id)

    with pytest.raises(BusinessRuleViolationError):
        await service.cancel_sale(sale.id)


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


async def test_compute_totals_does_not_persist_or_touch_stock(db_session: AsyncSession) -> None:
    stock, product = await _seed_stock_with_product(db_session, quantity=5)
    today = date.today()
    promotion_service = _build_promotion_service(db_session)
    promotion = await promotion_service.create(
        Promotion(name="10% Remeras", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=product.id,
            )
        ],
    )
    service = _build_sale_service(db_session)
    item = SaleItem(stock_id=stock.id, quantity=2, unit_price=Decimal("20.00"))

    computed = await service.compute_totals(
        branch_id=stock.branch_id, discount=Decimal("0"), items=[item]
    )

    assert computed.id is None
    assert computed.promotion_discount == Decimal("4.00")
    assert computed.total == Decimal("36.00")
    assert item.promotion_id == promotion.id

    all_sales = await service.list_all()
    assert all_sales == []
    updated_stock = await SqlAlchemyStockRepository(db_session).get_by_id(stock.id)
    assert updated_stock is not None
    assert updated_stock.quantity == 5


async def test_create_sale_applies_percentage_promotion(db_session: AsyncSession) -> None:
    stock, product = await _seed_stock_with_product(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = _build_promotion_service(db_session)
    promotion = await promotion_service.create(
        Promotion(name="10% Remeras", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=product.id,
            )
        ],
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
    items = await service.get_items(sale.id)
    assert items[0].promotion_id == promotion.id


async def test_create_sale_promotion_payment_mismatch_at_old_total_raises(
    db_session: AsyncSession,
) -> None:
    stock, product = await _seed_stock_with_product(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = _build_promotion_service(db_session)
    await promotion_service.create(
        Promotion(name="10% Remeras", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=product.id,
            )
        ],
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
    promotion_service = _build_promotion_service(db_session)
    await promotion_service.create(
        Promotion(name="Descuento fijo grande", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.FIXED_AMOUNT,
                discount_value=Decimal("50.00"),
                product_id=product.id,
            )
        ],
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
    promotion_service = _build_promotion_service(db_session)
    await promotion_service.create(
        Promotion(name="10% Categoria", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                category_id=product.category_id,
            )
        ],
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
    promotion_service = _build_promotion_service(db_session)
    await promotion_service.create(
        Promotion(
            name="Vencida",
            start_date=today - timedelta(days=10),
            end_date=today - timedelta(days=1),
        ),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=product.id,
            )
        ],
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
    promotion_service = _build_promotion_service(db_session)
    await promotion_service.create(
        Promotion(name="10% Remeras", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=product.id,
            )
        ],
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


async def test_create_sale_stores_discount_reason(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("5.00"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("15.00"),
                amount_with_surcharge=Decimal("15.00"),
            )
        ],
        discount_reason="Cliente frecuente",
    )

    assert sale.discount_reason == "Cliente frecuente"


async def test_create_sale_without_discount_reason_defaults_to_none(
    db_session: AsyncSession,
) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
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

    assert sale.discount_reason is None


async def test_create_sale_item_promotion_id_is_none_without_promotion(
    db_session: AsyncSession,
) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
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

    items = await service.get_items(sale.id)
    assert items[0].promotion_id is None


async def test_create_sale_combo_promotion_wins_over_single_item_promotion(
    db_session: AsyncSession,
) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    shorts = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Short",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("15.00"),
            price=Decimal("30.00"),
        )
    )
    shirt = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10.00"),
            price=Decimal("20.00"),
        )
    )
    shorts_stock = await _seed_stock_for_product_in_branch(db_session, shorts, branch, 5)
    shirt_stock = await _seed_stock_for_product_in_branch(db_session, shirt, branch, 5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = _build_promotion_service(db_session)

    await promotion_service.create(
        Promotion(name="10% Remera sola", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=shirt.id,
            )
        ],
    )
    combo = await promotion_service.create(
        Promotion(name="15% Short+Remera", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("15"),
                product_id=shorts.id,
            ),
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("15"),
                product_id=shirt.id,
            ),
        ],
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=branch.id,
        discount=Decimal("0"),
        items=[
            SaleItem(stock_id=shorts_stock.id, quantity=1, unit_price=Decimal("30.00")),
            SaleItem(stock_id=shirt_stock.id, quantity=1, unit_price=Decimal("20.00")),
        ],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("42.50"),
                amount_with_surcharge=Decimal("42.50"),
            )
        ],
    )

    assert sale.promotion_discount == Decimal("7.50")
    items = await service.get_items(sale.id)
    assert all(item.promotion_id == combo.id for item in items)


async def test_create_sale_with_surcharge_covers_total_from_net_amount(
    db_session: AsyncSession,
) -> None:
    """A payment through a method with a surcharge covers the sale by its net
    (amount_without_surcharge), not its gross (amount_with_surcharge)."""
    stock = await _seed_stock(db_session, quantity=5)
    card = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Debito", surcharge_percentage=Decimal("15"))
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=card.id,
                amount_without_surcharge=Decimal("20.00"),
                amount_with_surcharge=Decimal("23.00"),
            )
        ],
    )

    assert sale.total == Decimal("20.00")


async def test_create_sale_rejects_surcharge_mismatch(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    card = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Debito", surcharge_percentage=Decimal("15"))
    )
    service = _build_sale_service(db_session)

    with pytest.raises(BusinessRuleViolationError):
        await service.create_sale(
            branch_id=stock.branch_id,
            discount=Decimal("0"),
            items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
            payments=[
                SalePayment(
                    payment_method_id=card.id,
                    amount_without_surcharge=Decimal("20.00"),
                    # Doesn't match 20.00 * 1.15 = 23.00.
                    amount_with_surcharge=Decimal("20.00"),
                )
            ],
        )


async def test_get_items_summary_single_product(db_session: AsyncSession) -> None:
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

    summary = await service.get_items_summary(sale.id)

    assert summary == "Remera x2"


async def test_get_items_summary_multiple_products(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    shorts = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Short",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("15.00"),
            price=Decimal("30.00"),
        )
    )
    shirt = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10.00"),
            price=Decimal("20.00"),
        )
    )
    shorts_stock = await _seed_stock_for_product_in_branch(db_session, shorts, branch, 5)
    shirt_stock = await _seed_stock_for_product_in_branch(db_session, shirt, branch, 5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=branch.id,
        discount=Decimal("0"),
        items=[
            SaleItem(stock_id=shorts_stock.id, quantity=1, unit_price=Decimal("30.00")),
            SaleItem(stock_id=shirt_stock.id, quantity=1, unit_price=Decimal("20.00")),
        ],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("50.00"),
                amount_with_surcharge=Decimal("50.00"),
            )
        ],
    )

    summary = await service.get_items_summary(sale.id)

    assert summary == "Short, Remera"


async def test_create_sale_combo_promotion_repeats_for_multiple_complete_sets(
    db_session: AsyncSession,
) -> None:
    """2 shirts + 2 shorts, combo min_quantity=1 each -> the combo triggers
    twice, discounting both shirts and both shorts."""
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    shorts = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Short",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("15.00"),
            price=Decimal("30.00"),
        )
    )
    shirt = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10.00"),
            price=Decimal("20.00"),
        )
    )
    shorts_stock = await _seed_stock_for_product_in_branch(db_session, shorts, branch, 5)
    shirt_stock = await _seed_stock_for_product_in_branch(db_session, shirt, branch, 5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = _build_promotion_service(db_session)
    await promotion_service.create(
        Promotion(name="Combo Short+Remera 15%", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("15"),
                product_id=shorts.id,
            ),
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("15"),
                product_id=shirt.id,
            ),
        ],
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=branch.id,
        discount=Decimal("0"),
        items=[
            SaleItem(stock_id=shorts_stock.id, quantity=2, unit_price=Decimal("30.00")),
            SaleItem(stock_id=shirt_stock.id, quantity=2, unit_price=Decimal("20.00")),
        ],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("85.00"),
                amount_with_surcharge=Decimal("85.00"),
            )
        ],
    )

    # subtotal = 60 + 40 = 100; discount = 15% of both shorts (9) + both shirts (6) = 15.
    assert sale.promotion_discount == Decimal("15.00")
    assert sale.total == Decimal("85.00")


async def test_create_sale_combo_promotion_limited_by_scarcer_line(
    db_session: AsyncSession,
) -> None:
    """2 shirts + 1 short, combo min_quantity=1 each -> the combo triggers
    once (limited by the single short); the second shirt stays full price."""
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    shorts = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Short",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("15.00"),
            price=Decimal("30.00"),
        )
    )
    shirt = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10.00"),
            price=Decimal("20.00"),
        )
    )
    shorts_stock = await _seed_stock_for_product_in_branch(db_session, shorts, branch, 5)
    shirt_stock = await _seed_stock_for_product_in_branch(db_session, shirt, branch, 5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = _build_promotion_service(db_session)
    await promotion_service.create(
        Promotion(name="Combo Short+Remera 15%", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("15"),
                product_id=shorts.id,
            ),
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("15"),
                product_id=shirt.id,
            ),
        ],
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=branch.id,
        discount=Decimal("0"),
        items=[
            SaleItem(stock_id=shorts_stock.id, quantity=1, unit_price=Decimal("30.00")),
            SaleItem(stock_id=shirt_stock.id, quantity=2, unit_price=Decimal("20.00")),
        ],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("62.50"),
                amount_with_surcharge=Decimal("62.50"),
            )
        ],
    )

    # subtotal = 30 + 40 = 70; discount = 15% of 1 short (4.5) + 1 shirt (3) = 7.5.
    # The second shirt (20.00) stays full price.
    assert sale.promotion_discount == Decimal("7.50")
    assert sale.total == Decimal("62.50")
    items = await service.get_items(sale.id)
    shirt_items = [item for item in items if item.stock_id == shirt_stock.id]
    assert len(shirt_items) == 1
    assert shirt_items[0].promotion_id is not None
    # The single shirt SaleItem carries quantity=2, but only 1 unit was
    # covered by the combo — that's a known coarseness of applying the
    # discount at the SaleItem level rather than per-unit.


async def test_create_sale_single_line_threshold_promotion_not_limited_to_multiples(
    db_session: AsyncSession,
) -> None:
    """A single-line promo with min_quantity=3 ("10% off if you buy 3+") must
    keep discounting every matching unit in the cart, not just multiples of 3
    — min_quantity there is a threshold gate, not a combo unit."""
    stock, product = await _seed_stock_with_product(db_session, quantity=10)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    today = date.today()
    promotion_service = _build_promotion_service(db_session)
    await promotion_service.create(
        Promotion(name="10% si comprás 3+", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=product.id,
                min_quantity=3,
            )
        ],
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch_id=stock.branch_id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=7, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("126.00"),
                amount_with_surcharge=Decimal("126.00"),
            )
        ],
    )

    # subtotal = 140; 10% off all 7 units (not just 6, a multiple of 3) = 14.
    assert sale.promotion_discount == Decimal("14.00")
    assert sale.total == Decimal("126.00")


async def test_create_sale_with_customer_attaches_customer_id(db_session: AsyncSession) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    customer = await SqlAlchemyCustomerRepository(db_session).create(
        Customer(dni="12345678", name="Cliente de Prueba")
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
        customer_id=customer.id,
    )

    assert sale.customer_id == customer.id


async def test_create_sale_with_unknown_customer_raises_entity_not_found(
    db_session: AsyncSession,
) -> None:
    stock = await _seed_stock(db_session, quantity=5)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    service = _build_sale_service(db_session)

    with pytest.raises(EntityNotFoundError):
        await service.create_sale(
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
            customer_id=999,
        )
