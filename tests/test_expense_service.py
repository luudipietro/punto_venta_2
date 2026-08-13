from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import EntityNotFoundError
from app.domain.branch import Branch
from app.domain.expense import Expense
from app.domain.payment_method import PaymentMethod
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.expense_repository import SqlAlchemyExpenseRepository
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.services.expense_service import ExpenseService


def _build_expense_service(session: AsyncSession) -> ExpenseService:
    return ExpenseService(
        SqlAlchemyExpenseRepository(session),
        SqlAlchemyBranchRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
    )


async def test_create_expense(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )
    service = _build_expense_service(db_session)

    expense = await service.create(
        Expense(
            branch_id=branch.id,
            payment_method_id=payment_method.id,
            amount=Decimal("500.00"),
            description="Insumos de limpieza",
            date=date(2026, 1, 5),
        )
    )

    assert expense.id is not None
    assert expense.amount == Decimal("500.00")


async def test_create_expense_with_unknown_branch_raises(db_session: AsyncSession) -> None:
    payment_method = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )
    service = _build_expense_service(db_session)

    with pytest.raises(EntityNotFoundError):
        await service.create(
            Expense(
                branch_id=999,
                payment_method_id=payment_method.id,
                amount=Decimal("10.00"),
                description="Test",
                date=date(2026, 1, 5),
            )
        )


async def test_create_expense_with_unknown_payment_method_raises(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    service = _build_expense_service(db_session)

    with pytest.raises(EntityNotFoundError):
        await service.create(
            Expense(
                branch_id=branch.id,
                payment_method_id=999,
                amount=Decimal("10.00"),
                description="Test",
                date=date(2026, 1, 5),
            )
        )
