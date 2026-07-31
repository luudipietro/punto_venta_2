from fastapi import APIRouter, Depends, status

from app.domain.stock import Stock
from app.schemas.stock_schema import (
    StockCreate,
    StockQuantityAdjustment,
    StockRead,
    StockUpdate,
)
from app.services.stock_service import StockService, get_stock_service

router = APIRouter(prefix="/stocks", tags=["Stock"])


@router.get("", response_model=list[StockRead])
async def list_stocks(service: StockService = Depends(get_stock_service)) -> list[Stock]:
    return await service.list_all()


@router.get("/{stock_id}", response_model=StockRead)
async def get_stock(stock_id: int, service: StockService = Depends(get_stock_service)) -> Stock:
    return await service.get_by_id(stock_id)


@router.post("", response_model=StockRead, status_code=status.HTTP_201_CREATED)
async def create_stock(
    payload: StockCreate, service: StockService = Depends(get_stock_service)
) -> Stock:
    return await service.create(Stock(**payload.model_dump()))


@router.put("/{stock_id}", response_model=StockRead)
async def update_stock(
    stock_id: int, payload: StockUpdate, service: StockService = Depends(get_stock_service)
) -> Stock:
    return await service.update(stock_id, Stock(**payload.model_dump()))


@router.delete("/{stock_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stock(stock_id: int, service: StockService = Depends(get_stock_service)) -> None:
    await service.delete(stock_id)


@router.post("/{stock_id}/increase", response_model=StockRead)
async def increase_stock(
    stock_id: int,
    payload: StockQuantityAdjustment,
    service: StockService = Depends(get_stock_service),
) -> Stock:
    return await service.increase_quantity(stock_id, payload.amount)


@router.post("/{stock_id}/decrease", response_model=StockRead)
async def decrease_stock(
    stock_id: int,
    payload: StockQuantityAdjustment,
    service: StockService = Depends(get_stock_service),
) -> Stock:
    return await service.decrease_quantity(stock_id, payload.amount)
