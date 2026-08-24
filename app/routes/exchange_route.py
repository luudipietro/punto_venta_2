from fastapi import APIRouter, Depends, status

from app.domain.exchange import Exchange
from app.domain.exchange_new_item import ExchangeNewItem
from app.domain.exchange_payment import ExchangePayment
from app.domain.exchange_return_item import ExchangeReturnItem
from app.schemas.exchange_schema import (
    ExchangeCreate,
    ExchangeDetailRead,
    ExchangeNewItemRead,
    ExchangePaymentRead,
    ExchangeRead,
    ExchangeReturnItemRead,
)
from app.services.exchange_service import ExchangeService, get_exchange_service

router = APIRouter(prefix="/exchanges", tags=["Exchanges"])


@router.get("", response_model=list[ExchangeRead])
async def list_exchanges(
    service: ExchangeService = Depends(get_exchange_service),
) -> list[ExchangeRead]:
    return await service.list_all()


@router.get("/{exchange_id}", response_model=ExchangeDetailRead)
async def get_exchange(
    exchange_id: int, service: ExchangeService = Depends(get_exchange_service)
) -> ExchangeDetailRead:
    exchange = await service.get_by_id(exchange_id)
    returned_items = await service.get_returned_items(exchange_id)
    new_items = await service.get_new_items(exchange_id)
    payments = await service.get_payments(exchange_id)
    return _to_detail_read(exchange, returned_items, new_items, payments)


@router.post("", response_model=ExchangeDetailRead, status_code=status.HTTP_201_CREATED)
async def create_exchange(
    payload: ExchangeCreate, service: ExchangeService = Depends(get_exchange_service)
) -> ExchangeDetailRead:
    returned_items = [
        ExchangeReturnItem(
            stock_id=item.stock_id, quantity=item.quantity, unit_price=item.unit_price
        )
        for item in payload.returned_items
    ]
    new_items = [
        ExchangeNewItem(stock_id=item.stock_id, quantity=item.quantity, unit_price=item.unit_price)
        for item in payload.new_items
    ]
    payments = [
        ExchangePayment(payment_method_id=payment.payment_method_id, amount=payment.amount)
        for payment in payload.payments
    ]
    exchange = await service.create_exchange(payload.sale_id, returned_items, new_items, payments)
    return _to_detail_read(exchange, returned_items, new_items, payments)


def _to_detail_read(
    exchange: Exchange,
    returned_items: list[ExchangeReturnItem],
    new_items: list[ExchangeNewItem],
    payments: list[ExchangePayment],
) -> ExchangeDetailRead:
    return ExchangeDetailRead(
        id=exchange.id,
        sale_id=exchange.sale_id,
        branch_id=exchange.branch_id,
        created_at=exchange.created_at,
        returned_items=[ExchangeReturnItemRead.model_validate(item) for item in returned_items],
        new_items=[ExchangeNewItemRead.model_validate(item) for item in new_items],
        payments=[ExchangePaymentRead.model_validate(payment) for payment in payments],
    )
