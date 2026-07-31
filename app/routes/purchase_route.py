from decimal import Decimal

from fastapi import APIRouter, Depends, status

from app.domain.purchase_item import PurchaseItem
from app.schemas.purchase_schema import (
    PurchaseCreate,
    PurchaseDetailRead,
    PurchaseItemRead,
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
    return _to_detail_read(
        purchase.id,
        purchase.branch_id,
        purchase.supplier_name,
        purchase.subtotal,
        purchase.total,
        items,
    )


@router.post("", response_model=PurchaseDetailRead, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    payload: PurchaseCreate, service: PurchaseService = Depends(get_purchase_service)
) -> PurchaseDetailRead:
    items = [
        PurchaseItem(stock_id=item.stock_id, quantity=item.quantity, unit_cost=item.unit_cost)
        for item in payload.items
    ]
    purchase = await service.create_purchase(payload.branch_id, payload.supplier_name, items)
    return _to_detail_read(
        purchase.id,
        purchase.branch_id,
        purchase.supplier_name,
        purchase.subtotal,
        purchase.total,
        items,
    )


def _to_detail_read(
    purchase_id: int,
    branch_id: int,
    supplier_name: str | None,
    subtotal: Decimal,
    total: Decimal,
    items: list[PurchaseItem],
) -> PurchaseDetailRead:
    return PurchaseDetailRead(
        id=purchase_id,
        branch_id=branch_id,
        supplier_name=supplier_name,
        subtotal=subtotal,
        total=total,
        items=[PurchaseItemRead.model_validate(item) for item in items],
    )
