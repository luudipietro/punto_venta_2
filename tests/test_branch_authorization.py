from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PermissionDeniedError
from app.domain.branch import Branch
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.expense import Expense
from app.domain.payment_method import PaymentMethod
from app.domain.product import Product
from app.domain.purchase_item import PurchaseItem
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.domain.stock import Stock
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.customer_repository import SqlAlchemyCustomerRepository
from app.repositories.exchange_new_item_repository import SqlAlchemyExchangeNewItemRepository
from app.repositories.exchange_return_item_repository import (
    SqlAlchemyExchangeReturnItemRepository,
)
from app.repositories.expense_repository import SqlAlchemyExpenseRepository
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.promotion_item_repository import SqlAlchemyPromotionItemRepository
from app.repositories.promotion_repository import SqlAlchemyPromotionRepository
from app.repositories.purchase_item_repository import SqlAlchemyPurchaseItemRepository
from app.repositories.purchase_repository import SqlAlchemyPurchaseRepository
from app.repositories.sale_item_repository import SqlAlchemySaleItemRepository
from app.repositories.sale_payment_repository import SqlAlchemySalePaymentRepository
from app.repositories.sale_repository import SqlAlchemySaleRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.promotion_service import PromotionService
from app.services.purchase_service import PurchaseService
from app.services.sale_service import SaleService
from app.services.stock_service import StockService


async def _seed_stock(session: AsyncSession, branch: Branch, quantity: int = 10) -> Stock:
    category = await SqlAlchemyCategoryRepository(session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(session).create(Brand(name="Nike"))
    product = await SqlAlchemyProductRepository(session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10"),
            price=Decimal("20"),
        )
    )
    return await SqlAlchemyStockRepository(session).create(
        Stock(
            product_id=product.id,
            branch_id=branch.id,
            quantity=quantity,
            color_id=None,
            size_id=None,
        )
    )


def _build_stock_service(session: AsyncSession) -> StockService:
    return StockService(
        SqlAlchemyStockRepository(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyColorRepository(session),
        SqlAlchemySizeRepository(session),
        SqlAlchemyBranchRepository(session),
    )


def _build_sale_service(session: AsyncSession) -> SaleService:
    return SaleService(
        SqlAlchemySaleRepository(session),
        SqlAlchemySaleItemRepository(session),
        SqlAlchemySalePaymentRepository(session),
        _build_stock_service(session),
        SqlAlchemyPaymentMethodRepository(session),
        SqlAlchemyProductRepository(session),
        PromotionService(
            SqlAlchemyPromotionRepository(session),
            SqlAlchemyPromotionItemRepository(session),
            SqlAlchemyProductRepository(session),
            SqlAlchemyCategoryRepository(session),
        ),
        SqlAlchemyCustomerRepository(session),
        SqlAlchemyExchangeReturnItemRepository(session),
        SqlAlchemyExchangeNewItemRepository(session),
    )


def _build_purchase_service(session: AsyncSession) -> PurchaseService:
    return PurchaseService(
        SqlAlchemyPurchaseRepository(session),
        SqlAlchemyPurchaseItemRepository(session),
        _build_stock_service(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
    )


async def test_increase_quantity_from_another_branch_raises(db_session: AsyncSession) -> None:
    branch_a = await SqlAlchemyBranchRepository(db_session).create(Branch(name="A"))
    branch_b = await SqlAlchemyBranchRepository(db_session).create(Branch(name="B"))
    stock = await _seed_stock(db_session, branch_a)
    service = _build_stock_service(db_session)

    with pytest.raises(PermissionDeniedError):
        await service.increase_quantity(stock.id, 5, acting_branch_id=branch_b.id)


async def test_increase_quantity_from_own_branch_succeeds(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="A"))
    stock = await _seed_stock(db_session, branch)
    service = _build_stock_service(db_session)

    updated = await service.increase_quantity(stock.id, 5, acting_branch_id=branch.id)

    assert updated.quantity == 15


async def test_decrease_quantity_from_another_branch_raises(db_session: AsyncSession) -> None:
    branch_a = await SqlAlchemyBranchRepository(db_session).create(Branch(name="A"))
    branch_b = await SqlAlchemyBranchRepository(db_session).create(Branch(name="B"))
    stock = await _seed_stock(db_session, branch_a)
    service = _build_stock_service(db_session)

    with pytest.raises(PermissionDeniedError):
        await service.decrease_quantity(stock.id, 1, acting_branch_id=branch_b.id)


async def test_create_sale_for_another_branch_raises(db_session: AsyncSession) -> None:
    branch_a = await SqlAlchemyBranchRepository(db_session).create(Branch(name="A"))
    branch_b = await SqlAlchemyBranchRepository(db_session).create(Branch(name="B"))
    stock = await _seed_stock(db_session, branch_a)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    service = _build_sale_service(db_session)

    with pytest.raises(PermissionDeniedError):
        await service.create_sale(
            branch_a.id,
            Decimal("0"),
            [SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
            [
                SalePayment(
                    payment_method_id=payment_method.id,
                    amount_without_surcharge=Decimal("20.00"),
                    amount_with_surcharge=Decimal("20.00"),
                )
            ],
            acting_branch_id=branch_b.id,
        )


async def test_create_sale_for_own_branch_succeeds(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="A"))
    stock = await _seed_stock(db_session, branch)
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    service = _build_sale_service(db_session)

    sale = await service.create_sale(
        branch.id,
        Decimal("0"),
        [SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        [
            SalePayment(
                payment_method_id=payment_method.id,
                amount_without_surcharge=Decimal("20.00"),
                amount_with_surcharge=Decimal("20.00"),
            )
        ],
        acting_branch_id=branch.id,
    )

    assert sale.id is not None


async def test_create_purchase_for_another_branch_raises(db_session: AsyncSession) -> None:
    branch_a = await SqlAlchemyBranchRepository(db_session).create(Branch(name="A"))
    branch_b = await SqlAlchemyBranchRepository(db_session).create(Branch(name="B"))
    stock = await _seed_stock(db_session, branch_a)
    service = _build_purchase_service(db_session)

    with pytest.raises(PermissionDeniedError):
        await service.create_purchase(
            branch_a.id,
            None,
            [PurchaseItem(stock_id=stock.id, quantity=1, unit_cost=Decimal("10.00"))],
            acting_branch_id=branch_b.id,
        )


async def test_create_expense_for_another_branch_raises(db_session: AsyncSession) -> None:
    branch_a = await SqlAlchemyBranchRepository(db_session).create(Branch(name="A"))
    branch_b = await SqlAlchemyBranchRepository(db_session).create(Branch(name="B"))
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo")
    )
    from app.services.expense_service import ExpenseService

    service = ExpenseService(
        SqlAlchemyExpenseRepository(db_session),
        SqlAlchemyBranchRepository(db_session),
        SqlAlchemyPaymentMethodRepository(db_session),
    )

    with pytest.raises(PermissionDeniedError):
        await service.create(
            Expense(
                branch_id=branch_a.id,
                payment_method_id=payment_method.id,
                amount=Decimal("10.00"),
                description="Insumos",
                date=date.today(),
            ),
            acting_branch_id=branch_b.id,
        )
