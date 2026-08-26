from datetime import date

from fastapi import APIRouter, Depends, Query

from app.core.auth import require_admin
from app.domain.financial_summary import FinancialSummary
from app.schemas.report_schema import FinancialSummaryRead
from app.services.report_service import ReportService, get_report_service

router = APIRouter(prefix="/reports", tags=["Reports"], dependencies=[Depends(require_admin)])


@router.get("/financial-summary", response_model=FinancialSummaryRead)
async def get_financial_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    branch_id: int | None = Query(default=None),
    service: ReportService = Depends(get_report_service),
) -> FinancialSummary:
    return await service.financial_summary(start_date, end_date, branch_id)
