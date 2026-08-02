from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.branch import Branch
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.color import Color
from app.domain.product import Product
from app.domain.purchase_item import PurchaseItem
from app.domain.size import Size
from app.domain.stock import Stock
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
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
