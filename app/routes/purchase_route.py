from fastapi import APIRouter, Depends, status

from app.core.auth import acting_branch_id_of, get_current_user
from app.domain.purchase import Purchase
from app.domain.purchase_item import PurchaseItem
from app.domain.user import User
from app.schemas.purchase_schema import (
    PurchaseCreate,
    PurchaseDetailRead,
    PurchaseItemRead,
    PurchasePayInput,
    PurchaseRead,
)
from app.services.purchase_service import PurchaseService, get_purchase_service

router = APIRouter(prefix="/purchases", tags=["Purchases"])


@router.get("", response_model=list[PurchaseRead])
async def list_purchases(
    service: PurchaseService = Depends(get_purchase_service),
) -> list[PurchaseRead]:
    return await service.list_all()


@router.get("/{purchase_id}", response_model=PurchaseDetailRead)
async def get_purchase(
    purchase_id: int, service: PurchaseService = Depends(get_purchase_service)
) -> PurchaseDetailRead:
    purchase = await service.get_by_id(purchase_id)
    items = await service.get_items(purchase_id)
    return _to_detail_read(purchase, items)


@router.post("", response_model=PurchaseDetailRead, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    payload: PurchaseCreate,
    service: PurchaseService = Depends(get_purchase_service),
    current_user: User = Depends(get_current_user),
) -> PurchaseDetailRead:
    items = [
        PurchaseItem(stock_id=item.stock_id, quantity=item.quantity, unit_cost=item.unit_cost)
        for item in payload.items
    ]
    purchase = await service.create_purchase(
        payload.branch_id,
        payload.supplier_name,
        items,
        payment_method_id=payload.payment_method_id,
        payment_date=payload.payment_date,
        acting_branch_id=acting_branch_id_of(current_user),
    )
    return _to_detail_read(purchase, items)


@router.post("/{purchase_id}/pay", response_model=PurchaseRead)
async def pay_purchase(
    purchase_id: int,
    payload: PurchasePayInput,
    service: PurchaseService = Depends(get_purchase_service),
    current_user: User = Depends(get_current_user),
) -> PurchaseRead:
    purchase = await service.mark_paid(
        purchase_id,
        payload.payment_method_id,
        payload.payment_date,
        acting_branch_id=acting_branch_id_of(current_user),
    )
    return PurchaseRead.model_validate(purchase)


@router.post("/{purchase_id}/cancel", response_model=PurchaseRead)
async def cancel_purchase(
    purchase_id: int,
    service: PurchaseService = Depends(get_purchase_service),
    current_user: User = Depends(get_current_user),
) -> PurchaseRead:
    purchase = await service.cancel_purchase(
        purchase_id, acting_branch_id=acting_branch_id_of(current_user)
    )
    return PurchaseRead.model_validate(purchase)


def _to_detail_read(purchase: Purchase, items: list[PurchaseItem]) -> PurchaseDetailRead:
    return PurchaseDetailRead(
        id=purchase.id,
        branch_id=purchase.branch_id,
        supplier_name=purchase.supplier_name,
        subtotal=purchase.subtotal,
        total=purchase.total,
        payment_method_id=purchase.payment_method_id,
        payment_date=purchase.payment_date,
        is_paid=purchase.is_paid,
        cancelled_at=purchase.cancelled_at,
        items=[PurchaseItemRead.model_validate(item) for item in items],
    )
