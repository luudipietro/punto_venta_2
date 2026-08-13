from datetime import date
from decimal import Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.daily_balance import DailyBalance
from app.infrastructure.db.session import get_db
from app.repositories.expense_repository import ExpenseRepository, SqlAlchemyExpenseRepository
from app.repositories.payment_method_repository import (
    PaymentMethodRepository,
    SqlAlchemyPaymentMethodRepository,
)
from app.repositories.sale_payment_repository import (
    SalePaymentRepository,
    SqlAlchemySalePaymentRepository,
)
from app.repositories.sale_repository import SaleRepository, SqlAlchemySaleRepository


class ReportService:
    """Read-only aggregate views over Sale/Expense data. Not a persisted
    entity, so it skips the usual repository CRUD shape and just composes
    other repositories' data in memory — acceptable at a single POS's data
    volume, and avoids a bespoke SQL aggregation query."""

    def __init__(
        self,
        sale_repository: SaleRepository,
        sale_payment_repository: SalePaymentRepository,
        expense_repository: ExpenseRepository,
        payment_method_repository: PaymentMethodRepository,
    ) -> None:
        self._sale_repository = sale_repository
        self._sale_payment_repository = sale_payment_repository
        self._expense_repository = expense_repository
        self._payment_method_repository = payment_method_repository

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

        cash_by_date: dict[date, Decimal] = {}
        total_by_date: dict[date, Decimal] = {}
        for sale in sales:
            sale_date = sale.created_at.date()
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

        all_dates = sorted(
            set(cash_by_date) | set(total_by_date) | set(expenses_by_date), reverse=True
        )
        return [
            DailyBalance(
                date=day,
                sales_cash_total=cash_by_date.get(day, Decimal("0")),
                sales_total=total_by_date.get(day, Decimal("0")),
                expenses_cash_total=expenses_by_date.get(day, Decimal("0")),
                balance=cash_by_date.get(day, Decimal("0"))
                - expenses_by_date.get(day, Decimal("0")),
            )
            for day in all_dates
        ]


def get_report_service(session: AsyncSession = Depends(get_db)) -> ReportService:
    return ReportService(
        SqlAlchemySaleRepository(session),
        SqlAlchemySalePaymentRepository(session),
        SqlAlchemyExpenseRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
    )
