from fastapi import APIRouter, Depends, status

from app.core.auth import acting_branch_id_of, get_current_user
from app.domain.expense import Expense
from app.domain.user import User
from app.schemas.expense_schema import ExpenseCreate, ExpenseRead, ExpenseUpdate
from app.services.expense_service import ExpenseService, get_expense_service

router = APIRouter(prefix="/expenses", tags=["Expenses"])


@router.get("", response_model=list[ExpenseRead])
async def list_expenses(
    service: ExpenseService = Depends(get_expense_service),
) -> list[Expense]:
    return await service.list_all()


@router.get("/{expense_id}", response_model=ExpenseRead)
async def get_expense(
    expense_id: int, service: ExpenseService = Depends(get_expense_service)
) -> Expense:
    return await service.get_by_id(expense_id)


@router.post("", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_expense(
    payload: ExpenseCreate,
    service: ExpenseService = Depends(get_expense_service),
    current_user: User = Depends(get_current_user),
) -> Expense:
    return await service.create(
        Expense(**payload.model_dump()), acting_branch_id=acting_branch_id_of(current_user)
    )


@router.put("/{expense_id}", response_model=ExpenseRead)
async def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    service: ExpenseService = Depends(get_expense_service),
    current_user: User = Depends(get_current_user),
) -> Expense:
    return await service.update(
        expense_id,
        Expense(**payload.model_dump()),
        acting_branch_id=acting_branch_id_of(current_user),
    )


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: int, service: ExpenseService = Depends(get_expense_service)
) -> None:
    await service.delete(expense_id)
