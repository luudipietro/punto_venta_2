from abc import ABC, abstractmethod

from app.domain.expense import Expense
from app.infrastructure.db.models.expense_model import ExpenseModel
from app.repositories.base_repository import SqlAlchemyRepository


class ExpenseRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[Expense]: ...

    @abstractmethod
    async def get_by_id(self, expense_id: int) -> Expense | None: ...

    @abstractmethod
    async def create(self, expense: Expense) -> Expense: ...

    @abstractmethod
    async def update(self, expense: Expense) -> Expense: ...

    @abstractmethod
    async def delete(self, expense_id: int) -> None: ...


class SqlAlchemyExpenseRepository(SqlAlchemyRepository[ExpenseModel], ExpenseRepository):
    model = ExpenseModel

    async def list_all(self) -> list[Expense]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, expense_id: int) -> Expense | None:
        model = await self._get_model(expense_id)
        return self._to_domain(model) if model else None

    async def create(self, expense: Expense) -> Expense:
        model = ExpenseModel(
            branch_id=expense.branch_id,
            payment_method_id=expense.payment_method_id,
            amount=expense.amount,
            description=expense.description,
            date=expense.date,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, expense: Expense) -> Expense:
        model = await self._get_model(expense.id)
        model.branch_id = expense.branch_id
        model.payment_method_id = expense.payment_method_id
        model.amount = expense.amount
        model.description = expense.description
        model.date = expense.date
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, expense_id: int) -> None:
        model = await self._get_model(expense_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: ExpenseModel) -> Expense:
        return Expense(
            id=model.id,
            branch_id=model.branch_id,
            payment_method_id=model.payment_method_id,
            amount=model.amount,
            description=model.description,
            date=model.date,
        )
