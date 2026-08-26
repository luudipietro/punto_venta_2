from datetime import UTC, date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.daily_balance import DailyBalance
from app.domain.financial_summary import DailySeriesPoint, FinancialSummary, PaymentMethodBreakdown
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

    async def financial_summary(
        self, start_date: date, end_date: date, branch_id: int | None = None
    ) -> FinancialSummary:
        """Same in-memory composition as `daily_cash_balance`, generalized
        from one calendar day/one branch to an arbitrary date range and
        optionally every branch at once (`branch_id=None`). Drill-down rows
        aren't included here — the frontend re-uses the existing
        GET /sales, /purchases, /expenses, /exchanges endpoints and filters
        the already-loaded lists client-side by the same range, the same
        "acceptable at this scale" pattern SalesHistoryPage already uses."""
        payment_methods = await self._payment_method_repository.list_all()
        methods_by_id = {method.id: method for method in payment_methods}
        cash_method_ids = {method.id for method in payment_methods if method.is_cash}

        def in_range(day: date) -> bool:
            return start_date <= day <= end_date

        sales = [
            sale
            for sale in await self._sale_repository.list_all()
            if sale.cancelled_at is None
            and (branch_id is None or sale.branch_id == branch_id)
            and in_range(_to_art_date(sale.created_at))
        ]
        expenses = [
            expense
            for expense in await self._expense_repository.list_all()
            if (branch_id is None or expense.branch_id == branch_id) and in_range(expense.date)
        ]
        purchases = [
            purchase
            for purchase in await self._purchase_repository.list_all()
            if purchase.is_paid
            and purchase.cancelled_at is None
            and (branch_id is None or purchase.branch_id == branch_id)
            and purchase.payment_date is not None
            and in_range(purchase.payment_date)
        ]
        exchanges = [
            exchange
            for exchange in await self._exchange_repository.list_all()
            if (branch_id is None or exchange.branch_id == branch_id)
            and in_range(_to_art_date(exchange.created_at))
        ]

        sales_total = sum((sale.total for sale in sales), Decimal("0"))
        purchases_total = sum((purchase.total for purchase in purchases), Decimal("0"))
        expenses_total = sum((expense.amount for expense in expenses), Decimal("0"))

        by_method: dict[int, dict[str, Decimal]] = {
            method.id: {
                "sales": Decimal("0"),
                "purchases": Decimal("0"),
                "expenses": Decimal("0"),
                "exchanges": Decimal("0"),
            }
            for method in payment_methods
        }
        daily: dict[date, dict[str, Decimal]] = {}

        def bump_daily(day: date, key: str, amount: Decimal) -> None:
            bucket = daily.setdefault(
                day, {"sales": Decimal("0"), "purchases": Decimal("0"), "expenses": Decimal("0")}
            )
            bucket[key] += amount

        cash_total = Decimal("0")
        for sale in sales:
            sale_day = _to_art_date(sale.created_at)
            bump_daily(sale_day, "sales", sale.total)
            for payment in await self._sale_payment_repository.list_by_sale(sale.id):
                if payment.payment_method_id in by_method:
                    by_method[payment.payment_method_id]["sales"] += payment.amount_with_surcharge
                if payment.payment_method_id in cash_method_ids:
                    cash_total += payment.amount_with_surcharge

        for expense in expenses:
            bump_daily(expense.date, "expenses", expense.amount)
            if expense.payment_method_id in by_method:
                by_method[expense.payment_method_id]["expenses"] += expense.amount
            if expense.payment_method_id in cash_method_ids:
                cash_total -= expense.amount

        for purchase in purchases:
            assert purchase.payment_date is not None
            bump_daily(purchase.payment_date, "purchases", purchase.total)
            if purchase.payment_method_id in by_method:
                by_method[purchase.payment_method_id]["purchases"] += purchase.total
            if purchase.payment_method_id in cash_method_ids:
                cash_total -= purchase.total

        for exchange in exchanges:
            for payment in await self._exchange_payment_repository.list_by_exchange(exchange.id):
                if payment.payment_method_id in by_method:
                    by_method[payment.payment_method_id]["exchanges"] += payment.amount
                if payment.payment_method_id in cash_method_ids:
                    cash_total += payment.amount

        breakdown = [
            PaymentMethodBreakdown(
                payment_method_id=method_id,
                name=methods_by_id[method_id].name,
                sales_amount=totals["sales"],
                purchases_amount=totals["purchases"],
                expenses_amount=totals["expenses"],
                exchanges_amount=totals["exchanges"],
            )
            for method_id, totals in by_method.items()
            if any(totals.values())
        ]
        breakdown.sort(key=lambda b: b.name)

        series = [
            DailySeriesPoint(
                date=day,
                sales=totals["sales"],
                purchases=totals["purchases"],
                expenses=totals["expenses"],
            )
            for day, totals in sorted(daily.items())
        ]

        return FinancialSummary(
            start_date=start_date,
            end_date=end_date,
            sales_total=sales_total,
            purchases_total=purchases_total,
            expenses_total=expenses_total,
            net_cash_balance=cash_total,
            payment_method_breakdown=breakdown,
            daily_series=series,
        )


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
