from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import EntityNotFoundError
from app.domain.branch import Branch
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.product import Product
from app.domain.stock import Stock
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
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
