from fastapi import APIRouter, Depends, status

from app.domain.branch import Branch
from app.domain.daily_balance import DailyBalance
from app.schemas.branch_schema import BranchCreate, BranchRead, BranchUpdate
from app.schemas.report_schema import DailyBalanceRead
from app.services.branch_service import BranchService, get_branch_service
from app.services.report_service import ReportService, get_report_service

router = APIRouter(prefix="/branches", tags=["Branches"])


@router.get("", response_model=list[BranchRead])
async def list_branches(service: BranchService = Depends(get_branch_service)) -> list[Branch]:
    return await service.list_all()


@router.get("/{branch_id}", response_model=BranchRead)
async def get_branch(
    branch_id: int, service: BranchService = Depends(get_branch_service)
) -> Branch:
    return await service.get_by_id(branch_id)


@router.post("", response_model=BranchRead, status_code=status.HTTP_201_CREATED)
async def create_branch(
    payload: BranchCreate, service: BranchService = Depends(get_branch_service)
) -> Branch:
    return await service.create(Branch(**payload.model_dump()))


@router.put("/{branch_id}", response_model=BranchRead)
async def update_branch(
    branch_id: int, payload: BranchUpdate, service: BranchService = Depends(get_branch_service)
) -> Branch:
    return await service.update(branch_id, Branch(**payload.model_dump()))


@router.delete("/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_branch(
    branch_id: int, service: BranchService = Depends(get_branch_service)
) -> None:
    await service.delete(branch_id)


@router.get("/{branch_id}/daily-balance", response_model=list[DailyBalanceRead])
async def get_daily_balance(
    branch_id: int,
    branch_service: BranchService = Depends(get_branch_service),
    report_service: ReportService = Depends(get_report_service),
) -> list[DailyBalance]:
    await branch_service.get_by_id(branch_id)
    return await report_service.daily_cash_balance(branch_id)
