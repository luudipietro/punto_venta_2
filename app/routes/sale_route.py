from fastapi import APIRouter, Depends, status

from app.core.auth import acting_branch_id_of, get_current_user
from app.domain.sale import Sale
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.domain.user import User
from app.schemas.sale_schema import (
    SaleCreate,
    SaleDetailRead,
    SaleItemPreviewRead,
    SaleItemRead,
    SaleListRead,
    SalePaymentRead,
    SalePreviewInput,
    SalePreviewRead,
    SaleRead,
)
from app.services.sale_service import SaleService, get_sale_service

router = APIRouter(prefix="/sales", tags=["Sales"])


@router.get("", response_model=list[SaleListRead])
async def list_sales(service: SaleService = Depends(get_sale_service)) -> list[SaleListRead]:
    sales = await service.list_all()
    return [
        SaleListRead(
            **SaleRead.model_validate(sale).model_dump(),
            items_summary=await service.get_items_summary(sale.id),
        )
        for sale in sales
    ]


@router.post("/preview", response_model=SalePreviewRead)
async def preview_sale(
    payload: SalePreviewInput, service: SaleService = Depends(get_sale_service)
) -> SalePreviewRead:
    """Computes what a sale's totals (including any applied promotions) would be
    without persisting anything — lets the frontend show live promo/total feedback
    as the cart changes, before the employee picks payment methods."""
    items = [
        SaleItem(stock_id=item.stock_id, quantity=item.quantity, unit_price=item.unit_price)
        for item in payload.items
    ]
    computed = await service.compute_totals(
        payload.branch_id, payload.discount, items, discount_reason=payload.discount_reason
    )
    return SalePreviewRead(
        branch_id=computed.branch_id,
        subtotal=computed.subtotal,
        discount=computed.discount,
        promotion_discount=computed.promotion_discount,
        discount_reason=computed.discount_reason,
        total=computed.total,
        items=[
            SaleItemPreviewRead(
                stock_id=item.stock_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                promotion_id=item.promotion_id,
            )
            for item in items
        ],
    )


@router.get("/{sale_id}", response_model=SaleDetailRead)
async def get_sale(
    sale_id: int, service: SaleService = Depends(get_sale_service)
) -> SaleDetailRead:
    sale = await service.get_by_id(sale_id)
    items = await service.get_items(sale_id)
    payments = await service.get_payments(sale_id)
    return _to_detail_read(sale, items, payments)


@router.post("/{sale_id}/cancel", response_model=SaleDetailRead)
async def cancel_sale(
    sale_id: int,
    service: SaleService = Depends(get_sale_service),
    current_user: User = Depends(get_current_user),
) -> SaleDetailRead:
    sale = await service.cancel_sale(
        sale_id, acting_branch_id=acting_branch_id_of(current_user), acting_user=current_user
    )
    items = await service.get_items(sale_id)
    payments = await service.get_payments(sale_id)
    return _to_detail_read(sale, items, payments)


@router.post("", response_model=SaleDetailRead, status_code=status.HTTP_201_CREATED)
async def create_sale(
    payload: SaleCreate,
    service: SaleService = Depends(get_sale_service),
    current_user: User = Depends(get_current_user),
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
        customer_id=payload.customer_id,
        acting_branch_id=acting_branch_id_of(current_user),
        acting_user=current_user,
    )
    return _to_detail_read(sale, items, payments)


def _to_detail_read(
    sale: Sale, items: list[SaleItem], payments: list[SalePayment]
) -> SaleDetailRead:
    return SaleDetailRead(
        id=sale.id,
        branch_id=sale.branch_id,
        subtotal=sale.subtotal,
        discount=sale.discount,
        promotion_discount=sale.promotion_discount,
        discount_reason=sale.discount_reason,
        total=sale.total,
        created_at=sale.created_at,
        cancelled_at=sale.cancelled_at,
        customer_id=sale.customer_id,
        items=[SaleItemRead.model_validate(item) for item in items],
        payments=[SalePaymentRead.model_validate(payment) for payment in payments],
    )
