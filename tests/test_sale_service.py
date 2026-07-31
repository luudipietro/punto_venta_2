from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InsufficientStockError
from app.domain.branch import Branch
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.color import Color
from app.domain.payment_method import PaymentMethod
from app.domain.product import Product
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
from app.repositories.sale_item_repository import SqlAlchemySaleItemRepository
from app.repositories.sale_payment_repository import SqlAlchemySalePaymentRepository
from app.repositories.sale_repository import SqlAlchemySaleRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
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
