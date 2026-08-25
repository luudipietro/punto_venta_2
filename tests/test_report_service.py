from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.branch import Branch
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.exchange_payment import ExchangePayment
from app.domain.exchange_return_item import ExchangeReturnItem
from app.domain.expense import Expense
from app.domain.payment_method import PaymentMethod
from app.domain.product import Product
from app.domain.purchase_item import PurchaseItem
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.domain.stock import Stock
from app.infrastructure.db.models.sale_model import SaleModel
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
from app.services.exchange_service import ExchangeService
from app.services.promotion_service import PromotionService
from app.services.purchase_service import PurchaseService
from app.services.report_service import ReportService
from app.services.sale_service import SaleService
from app.services.stock_service import StockService


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
        SqlAlchemyExchangeReturnItemRepository(session),
        SqlAlchemyExchangeNewItemRepository(session),
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


def _build_report_service(session: AsyncSession) -> ReportService:
    return ReportService(
        SqlAlchemySaleRepository(session),
        SqlAlchemySalePaymentRepository(session),
        SqlAlchemyExpenseRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
        SqlAlchemyPurchaseRepository(session),
        SqlAlchemyExchangeRepository(session),
        SqlAlchemyExchangePaymentRepository(session),
    )


async def test_daily_cash_balance_only_counts_cash_payments_and_expenses(
    db_session: AsyncSession,
) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    product = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10"),
            price=Decimal("20"),
        )
    )
    stock = await SqlAlchemyStockRepository(db_session).create(
        Stock(product_id=product.id, branch_id=branch.id, quantity=10, color_id=None, size_id=None)
    )
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )
    card = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Tarjeta", is_cash=False)
    )

    sale_service = _build_sale_service(db_session)
    # Sale split across cash + card: only the cash half should count.
    sale = await sale_service.create_sale(
        branch_id=branch.id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=2, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=cash.id,
                amount_without_surcharge=Decimal("20.00"),
                amount_with_surcharge=Decimal("20.00"),
            ),
            SalePayment(
                payment_method_id=card.id,
                amount_without_surcharge=Decimal("20.00"),
                amount_with_surcharge=Decimal("20.00"),
            ),
        ],
    )

    expense_repo = SqlAlchemyExpenseRepository(db_session)
    # Use the sale's own server-set created_at date (not date.today()) so
    # this doesn't flake near midnight when the DB clock (UTC) and the local
    # Python clock disagree on what "today" is.
    today = sale.created_at.date()
    # Cash expense: should reduce the cash balance.
    await expense_repo.create(
        Expense(
            branch_id=branch.id,
            payment_method_id=cash.id,
            amount=Decimal("5.00"),
            description="Insumos",
            date=today,
        )
    )
    # Card expense: shouldn't touch cash balance at all.
    await expense_repo.create(
        Expense(
            branch_id=branch.id,
            payment_method_id=card.id,
            amount=Decimal("100.00"),
            description="Servicio",
            date=today,
        )
    )

    report_service = _build_report_service(db_session)
    balances = await report_service.daily_cash_balance(branch.id)

    assert len(balances) == 1
    day = balances[0]
    assert day.date == today
    assert day.sales_cash_total == Decimal("20.00")
    assert day.sales_total == Decimal("40.00")
    assert day.expenses_cash_total == Decimal("5.00")
    assert day.balance == Decimal("15.00")


async def test_daily_cash_balance_excludes_cancelled_sales(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    product = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10"),
            price=Decimal("20"),
        )
    )
    stock = await SqlAlchemyStockRepository(db_session).create(
        Stock(product_id=product.id, branch_id=branch.id, quantity=10, color_id=None, size_id=None)
    )
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )

    sale_service = _build_sale_service(db_session)
    sale = await sale_service.create_sale(
        branch_id=branch.id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=cash.id,
                amount_without_surcharge=Decimal("20.00"),
                amount_with_surcharge=Decimal("20.00"),
            )
        ],
    )
    await sale_service.cancel_sale(sale.id)

    report_service = _build_report_service(db_session)
    balances = await report_service.daily_cash_balance(branch.id)

    assert balances == []


async def test_daily_cash_balance_excludes_other_branches(db_session: AsyncSession) -> None:
    branch_a = await SqlAlchemyBranchRepository(db_session).create(Branch(name="A"))
    branch_b = await SqlAlchemyBranchRepository(db_session).create(Branch(name="B"))
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )
    await SqlAlchemyExpenseRepository(db_session).create(
        Expense(
            branch_id=branch_b.id,
            payment_method_id=cash.id,
            amount=Decimal("50.00"),
            description="Gasto de otra sucursal",
            date=date.today(),
        )
    )

    report_service = _build_report_service(db_session)
    balances = await report_service.daily_cash_balance(branch_a.id)

    assert balances == []


async def test_daily_cash_balance_subtracts_paid_cash_purchases(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    product = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10"),
            price=Decimal("20"),
        )
    )
    stock = await SqlAlchemyStockRepository(db_session).create(
        Stock(product_id=product.id, branch_id=branch.id, quantity=10, color_id=None, size_id=None)
    )
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )
    card = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Tarjeta", is_cash=False)
    )

    purchase_service = _build_purchase_service(db_session)
    today = date.today()
    # Paid in cash: should reduce the cash balance.
    await purchase_service.create_purchase(
        branch_id=branch.id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=2, unit_cost=Decimal("10.00"))],
        payment_method_id=cash.id,
        payment_date=today,
    )
    # Unpaid: shouldn't touch the balance at all.
    await purchase_service.create_purchase(
        branch_id=branch.id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=1, unit_cost=Decimal("999.00"))],
    )
    # Paid with card: shouldn't touch the cash balance.
    await purchase_service.create_purchase(
        branch_id=branch.id,
        supplier_name=None,
        items=[PurchaseItem(stock_id=stock.id, quantity=1, unit_cost=Decimal("999.00"))],
        payment_method_id=card.id,
        payment_date=today,
    )

    report_service = _build_report_service(db_session)
    balances = await report_service.daily_cash_balance(branch.id)

    assert len(balances) == 1
    day = balances[0]
    assert day.date == today
    assert day.purchases_cash_total == Decimal("20.00")
    assert day.balance == Decimal("-20.00")


async def test_daily_cash_balance_includes_exchange_cash_impact(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    product = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10"),
            price=Decimal("20"),
        )
    )
    stock = await SqlAlchemyStockRepository(db_session).create(
        Stock(product_id=product.id, branch_id=branch.id, quantity=10, color_id=None, size_id=None)
    )
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )

    sale_service = _build_sale_service(db_session)
    sale = await sale_service.create_sale(
        branch_id=branch.id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=cash.id,
                amount_without_surcharge=Decimal("20.00"),
                amount_with_surcharge=Decimal("20.00"),
            )
        ],
    )

    exchange_service = _build_exchange_service(db_session)
    # Pure return: the store refunds 20.00 in cash — a cash outflow.
    exchange = await exchange_service.create_exchange(
        sale_id=sale.id,
        returned_items=[
            ExchangeReturnItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))
        ],
        new_items=[],
        payments=[ExchangePayment(payment_method_id=cash.id, amount=Decimal("-20.00"))],
    )

    report_service = _build_report_service(db_session)
    balances = await report_service.daily_cash_balance(branch.id)

    today = sale.created_at.date()
    assert len(balances) == 1
    day = balances[0]
    assert day.date == today
    assert day.exchanges_cash_total == Decimal("-20.00")
    # sales_cash_total (20) - exchanges_cash_total magnitude (20) = 0 balance.
    assert day.balance == Decimal("0.00")
    assert exchange.branch_id == branch.id
    assert exchange.created_at is not None


async def test_daily_cash_balance_groups_late_night_sale_into_correct_art_day(
    db_session: AsyncSession,
) -> None:
    """A sale stored at 01:00 UTC is 22:00 ART the PREVIOUS day (ART = UTC-3),
    so the report must bucket it into the day before the naive UTC date."""
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    product = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10"),
            price=Decimal("20"),
        )
    )
    stock = await SqlAlchemyStockRepository(db_session).create(
        Stock(product_id=product.id, branch_id=branch.id, quantity=10, color_id=None, size_id=None)
    )
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )

    sale_service = _build_sale_service(db_session)
    sale = await sale_service.create_sale(
        branch_id=branch.id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=cash.id,
                amount_without_surcharge=Decimal("20.00"),
                amount_with_surcharge=Decimal("20.00"),
            )
        ],
    )

    utc_created_at = datetime(2026, 3, 10, 1, 0, 0)
    await db_session.execute(
        update(SaleModel).where(SaleModel.id == sale.id).values(created_at=utc_created_at)
    )
    await db_session.flush()

    report_service = _build_report_service(db_session)
    balances = await report_service.daily_cash_balance(branch.id)

    assert len(balances) == 1
    assert balances[0].date == date(2026, 3, 9)
