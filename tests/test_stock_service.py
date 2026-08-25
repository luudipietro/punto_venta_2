from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
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
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.purchase_item_repository import SqlAlchemyPurchaseItemRepository
from app.repositories.purchase_repository import SqlAlchemyPurchaseRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.purchase_service import PurchaseService
from app.services.stock_service import StockService


async def _seed_product_and_branch(session: AsyncSession) -> tuple[Product, Branch]:
    category = await SqlAlchemyCategoryRepository(session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(session).create(Brand(name="Nike"))
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
    return product, branch


def _build_stock_service(session: AsyncSession) -> StockService:
    return StockService(
        SqlAlchemyStockRepository(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyColorRepository(session),
        SqlAlchemySizeRepository(session),
        SqlAlchemyBranchRepository(session),
    )


async def test_create_stock_without_color_and_size(db_session: AsyncSession) -> None:
    product, branch = await _seed_product_and_branch(db_session)
    service = _build_stock_service(db_session)

    stock = await service.create(
        Stock(product_id=product.id, branch_id=branch.id, quantity=5, color_id=None, size_id=None)
    )

    assert stock.id is not None
    assert stock.color_id is None
    assert stock.size_id is None
    assert stock.quantity == 5


async def test_create_stock_with_unknown_color_raises(db_session: AsyncSession) -> None:
    product, branch = await _seed_product_and_branch(db_session)
    service = _build_stock_service(db_session)

    with pytest.raises(EntityNotFoundError):
        await service.create(
            Stock(
                product_id=product.id,
                branch_id=branch.id,
                quantity=5,
                color_id=999,
                size_id=None,
            )
        )


async def test_create_duplicate_stock_variant_raises_business_rule_error(
    db_session: AsyncSession,
) -> None:
    # uq_stock_variant only collides when color_id AND size_id are both set —
    # SQL treats any NULL column in a composite unique constraint as making
    # the row incomparable (see CLAUDE.md's NULL <> NULL note), so this test
    # needs a real color and size to exercise the constraint.
    product, branch = await _seed_product_and_branch(db_session)
    color = await SqlAlchemyColorRepository(db_session).create(Color(name="Negro"))
    size = await SqlAlchemySizeRepository(db_session).create(Size(label="M"))
    service = _build_stock_service(db_session)
    await service.create(
        Stock(
            product_id=product.id,
            branch_id=branch.id,
            quantity=5,
            color_id=color.id,
            size_id=size.id,
        )
    )

    with pytest.raises(BusinessRuleViolationError):
        await service.create(
            Stock(
                product_id=product.id,
                branch_id=branch.id,
                quantity=1,
                color_id=color.id,
                size_id=size.id,
            )
        )


async def test_create_stock_with_unknown_size_raises(db_session: AsyncSession) -> None:
    product, branch = await _seed_product_and_branch(db_session)
    service = _build_stock_service(db_session)

    with pytest.raises(EntityNotFoundError):
        await service.create(
            Stock(
                product_id=product.id,
                branch_id=branch.id,
                quantity=5,
                color_id=None,
                size_id=999,
            )
        )


async def test_delete_referenced_stock_raises_friendly_business_rule_error(
    db_session: AsyncSession,
) -> None:
    product, branch = await _seed_product_and_branch(db_session)
    service = _build_stock_service(db_session)
    stock = await service.create(
        Stock(product_id=product.id, branch_id=branch.id, quantity=5, color_id=None, size_id=None)
    )
    purchase_service = PurchaseService(
        SqlAlchemyPurchaseRepository(db_session),
        SqlAlchemyPurchaseItemRepository(db_session),
        service,
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyPaymentMethodRepository(db_session),
    )
    await purchase_service.create_purchase(
        branch_id=branch.id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=1, unit_cost=Decimal("10.00"))],
    )

    with pytest.raises(BusinessRuleViolationError):
        await service.delete(stock.id)
