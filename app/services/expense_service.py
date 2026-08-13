from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import EntityNotFoundError
from app.domain.expense import Expense
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import BranchRepository, SqlAlchemyBranchRepository
from app.repositories.expense_repository import ExpenseRepository, SqlAlchemyExpenseRepository
from app.repositories.payment_method_repository import (
    PaymentMethodRepository,
    SqlAlchemyPaymentMethodRepository,
)
from app.services.base_service import CrudService


class ExpenseService(CrudService[Expense]):
    entity_name = "Expense"

    def __init__(
        self,
        repository: ExpenseRepository,
        branch_repository: BranchRepository,
        payment_method_repository: PaymentMethodRepository,
    ) -> None:
        super().__init__(repository)
        self._branch_repository = branch_repository
        self._payment_method_repository = payment_method_repository

    async def create(self, expense: Expense) -> Expense:
        await self._ensure_references_exist(expense)
        return await super().create(expense)

    async def update(self, entity_id: int, expense: Expense) -> Expense:
        await self._ensure_references_exist(expense)
        return await super().update(entity_id, expense)

    async def _ensure_references_exist(self, expense: Expense) -> None:
        if await self._branch_repository.get_by_id(expense.branch_id) is None:
            raise EntityNotFoundError("Branch", expense.branch_id)
        if await self._payment_method_repository.get_by_id(expense.payment_method_id) is None:
            raise EntityNotFoundError("PaymentMethod", expense.payment_method_id)


def get_expense_service(session: AsyncSession = Depends(get_db)) -> ExpenseService:
    return ExpenseService(
        SqlAlchemyExpenseRepository(session),
        SqlAlchemyBranchRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
    )
