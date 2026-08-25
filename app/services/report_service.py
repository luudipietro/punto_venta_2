from datetime import UTC, date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.daily_balance import DailyBalance
from app.infrastructure.db.session import get_db
from app.repositories.exchange_payment_repository import (
    ExchangePaymentRepository,
    SqlAlchemyExchangePaymentRepository,
)
from app.repositories.exchange_repository import ExchangeRepository, SqlAlchemyExchangeRepository
from app.repositories.expense_repository import ExpenseRepository, SqlAlchemyExpenseRepository
from app.repositories.payment_method_repository import (
    PaymentMethodRepository,
    SqlAlchemyPaymentMethodRepository,
)
from app.repositories.purchase_repository import PurchaseRepository, SqlAlchemyPurchaseRepository
from app.repositories.sale_payment_repository import (
    SalePaymentRepository,
    SqlAlchemySalePaymentRepository,
)
from app.repositories.sale_repository import SaleRepository, SqlAlchemySaleRepository

_ART = ZoneInfo("America/Argentina/Buenos_Aires")


def _to_art_date(naive_utc: datetime) -> date:
    """Sale/Exchange.created_at is stored naive but is effectively UTC
    (server_default=func.now()). Attach UTC tzinfo explicitly, then convert
    to Argentina time before taking .date() — otherwise a sale made late at
    night ART groups into the wrong calendar day (UTC is 3h ahead of ART)."""
    return naive_utc.replace(tzinfo=UTC).astimezone(_ART).date()


class ReportService:
    """Read-only aggregate views over Sale/Expense/Purchase/Exchange data. Not
    a persisted entity, so it skips the usual repository CRUD shape and just
    composes other repositories' data in memory — acceptable at a single
    POS's data volume, and avoids a bespoke SQL aggregation query."""

    def __init__(
        self,
        sale_repository: SaleRepository,
        sale_payment_repository: SalePaymentRepository,
        expense_repository: ExpenseRepository,
        payment_method_repository: PaymentMethodRepository,
        purchase_repository: PurchaseRepository,
        exchange_repository: ExchangeRepository,
        exchange_payment_repository: ExchangePaymentRepository,
    ) -> None:
        self._sale_repository = sale_repository
        self._sale_payment_repository = sale_payment_repository
        self._expense_repository = expense_repository
        self._payment_method_repository = payment_method_repository
        self._purchase_repository = purchase_repository
        self._exchange_repository = exchange_repository
        self._exchange_payment_repository = exchange_payment_repository

    async def daily_cash_balance(self, branch_id: int) -> list[DailyBalance]:
        payment_methods = await self._payment_method_repository.list_all()
        cash_method_ids = {method.id for method in payment_methods if method.is_cash}

        sales = [
            sale
            for sale in await self._sale_repository.list_all()
            if sale.branch_id == branch_id and sale.cancelled_at is None
        ]
        expenses = [
            expense
            for expense in await self._expense_repository.list_all()
            if expense.branch_id == branch_id
        ]
        purchases = [
            purchase
            for purchase in await self._purchase_repository.list_all()
            if purchase.branch_id == branch_id
            and purchase.is_paid
            and purchase.cancelled_at is None
        ]
        exchanges = [
            exchange
            for exchange in await self._exchange_repository.list_all()
            if exchange.branch_id == branch_id
        ]

        cash_by_date: dict[date, Decimal] = {}
        total_by_date: dict[date, Decimal] = {}
        for sale in sales:
            sale_date = _to_art_date(sale.created_at)
            total_by_date[sale_date] = total_by_date.get(sale_date, Decimal("0")) + sale.total
            payments = await self._sale_payment_repository.list_by_sale(sale.id)
            cash_amount = sum(
                (
                    payment.amount_with_surcharge
                    for payment in payments
                    if payment.payment_method_id in cash_method_ids
                ),
                Decimal("0"),
            )
            cash_by_date[sale_date] = cash_by_date.get(sale_date, Decimal("0")) + cash_amount

        expenses_by_date: dict[date, Decimal] = {}
        for expense in expenses:
            if expense.payment_method_id in cash_method_ids:
                expenses_by_date[expense.date] = (
                    expenses_by_date.get(expense.date, Decimal("0")) + expense.amount
                )

        purchases_by_date: dict[date, Decimal] = {}
        for purchase in purchases:
            if purchase.payment_method_id in cash_method_ids and purchase.payment_date is not None:
                purchases_by_date[purchase.payment_date] = (
                    purchases_by_date.get(purchase.payment_date, Decimal("0")) + purchase.total
                )

        exchanges_by_date: dict[date, Decimal] = {}
        for exchange in exchanges:
            payments = await self._exchange_payment_repository.list_by_exchange(exchange.id)
            cash_amount = sum(
                (
                    payment.amount
                    for payment in payments
                    if payment.payment_method_id in cash_method_ids
                ),
                Decimal("0"),
            )
            exchange_date = _to_art_date(exchange.created_at)
            exchanges_by_date[exchange_date] = (
                exchanges_by_date.get(exchange_date, Decimal("0")) + cash_amount
            )

        all_dates = sorted(
            set(cash_by_date)
            | set(total_by_date)
            | set(expenses_by_date)
            | set(purchases_by_date)
            | set(exchanges_by_date),
            reverse=True,
        )
        return [
            DailyBalance(
                date=day,
                sales_cash_total=cash_by_date.get(day, Decimal("0")),
                sales_total=total_by_date.get(day, Decimal("0")),
                expenses_cash_total=expenses_by_date.get(day, Decimal("0")),
                purchases_cash_total=purchases_by_date.get(day, Decimal("0")),
                exchanges_cash_total=exchanges_by_date.get(day, Decimal("0")),
                balance=cash_by_date.get(day, Decimal("0"))
                - expenses_by_date.get(day, Decimal("0"))
                - purchases_by_date.get(day, Decimal("0"))
                + exchanges_by_date.get(day, Decimal("0")),
            )
            for day in all_dates
        ]


def get_report_service(session: AsyncSession = Depends(get_db)) -> ReportService:
    return ReportService(
        SqlAlchemySaleRepository(session),
        SqlAlchemySalePaymentRepository(session),
        SqlAlchemyExpenseRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
        SqlAlchemyPurchaseRepository(session),
        SqlAlchemyExchangeRepository(session),
        SqlAlchemyExchangePaymentRepository(session),
    )
