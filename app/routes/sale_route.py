from decimal import Decimal

from fastapi import APIRouter, Depends, status

from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.schemas.sale_schema import (
    SaleCreate,
    SaleDetailRead,
    SaleItemRead,
    SalePaymentRead,
    SaleRead,
)
from app.services.sale_service import SaleService, get_sale_service

router = APIRouter(prefix="/sales", tags=["Sales"])


@router.get("", response_model=list[SaleRead])
async def list_sales(service: SaleService = Depends(get_sale_service)) -> list[SaleRead]:
    return await service.list_all()


@router.get("/{sale_id}", response_model=SaleDetailRead)
async def get_sale(
    sale_id: int, service: SaleService = Depends(get_sale_service)
) -> SaleDetailRead:
    sale = await service.get_by_id(sale_id)
    items = await service.get_items(sale_id)
    payments = await service.get_payments(sale_id)
    return _to_detail_read(
        sale.id,
        sale.branch_id,
        sale.subtotal,
        sale.discount,
        sale.promotion_discount,
        sale.discount_reason,
        sale.total,
        items,
        payments,
    )


@router.post("", response_model=SaleDetailRead, status_code=status.HTTP_201_CREATED)
async def create_sale(
    payload: SaleCreate, service: SaleService = Depends(get_sale_service)
) -> SaleDetailRead:
    items = [
        SaleItem(stock_id=item.stock_id, quantity=item.quantity, unit_price=item.unit_price)
        for item in payload.items
    ]
    payments = [
        SalePayment(
            payment_method_id=payment.payment_method_id,
            amount_without_surcharge=payment.amount_without_surcharge,
            amount_with_surcharge=payment.amount_with_surcharge,
        )
        for payment in payload.payments
    ]
    sale = await service.create_sale(
        payload.branch_id,
        payload.discount,
        items,
        payments,
        discount_reason=payload.discount_reason,
    )
    return _to_detail_read(
        sale.id,
        sale.branch_id,
        sale.subtotal,
        sale.discount,
        sale.promotion_discount,
        sale.discount_reason,
        sale.total,
        items,
        payments,
    )


def _to_detail_read(
    sale_id: int,
    branch_id: int,
    subtotal: Decimal,
    discount: Decimal,
    promotion_discount: Decimal,
    discount_reason: str | None,
    total: Decimal,
    items: list[SaleItem],
    payments: list[SalePayment],
) -> SaleDetailRead:
    return SaleDetailRead(
        id=sale_id,
        branch_id=branch_id,
        subtotal=subtotal,
        discount=discount,
        promotion_discount=promotion_discount,
        discount_reason=discount_reason,
        total=total,
        items=[SaleItemRead.model_validate(item) for item in items],
        payments=[SalePaymentRead.model_validate(payment) for payment in payments],
    )
