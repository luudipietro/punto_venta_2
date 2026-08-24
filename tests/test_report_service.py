from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.branch import Branch
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.expense import Expense
from app.domain.payment_method import PaymentMethod
from app.domain.product import Product
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.domain.stock import Stock
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.expense_repository import SqlAlchemyExpenseRepository
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
    )


def _build_report_service(session: AsyncSession) -> ReportService:
    return ReportService(
        SqlAlchemySaleRepository(session),
        SqlAlchemySalePaymentRepository(session),
        SqlAlchemyExpenseRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
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
