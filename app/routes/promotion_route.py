from fastapi import APIRouter, Depends, status

from app.domain.promotion import Promotion
from app.domain.promotion_item import PromotionItem
from app.schemas.promotion_schema import (
    PromotionCreate,
    PromotionDetailRead,
    PromotionItemRead,
    PromotionRead,
    PromotionUpdate,
)
from app.services.promotion_service import PromotionService, get_promotion_service

router = APIRouter(prefix="/promotions", tags=["Promotions"])


@router.get("", response_model=list[PromotionRead])
async def list_promotions(
    service: PromotionService = Depends(get_promotion_service),
) -> list[Promotion]:
    return await service.list_all()


@router.get("/{promotion_id}", response_model=PromotionDetailRead)
async def get_promotion(
    promotion_id: int, service: PromotionService = Depends(get_promotion_service)
) -> PromotionDetailRead:
    promotion = await service.get_by_id(promotion_id)
    items = await service.get_items(promotion_id)
    return _to_detail_read(promotion, items)


@router.post("", response_model=PromotionDetailRead, status_code=status.HTTP_201_CREATED)
async def create_promotion(
    payload: PromotionCreate, service: PromotionService = Depends(get_promotion_service)
) -> PromotionDetailRead:
    promotion = Promotion(
        name=payload.name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        active=payload.active,
    )
    items = [
        PromotionItem(
            promotion_id=None,
            product_id=item.product_id,
            category_id=item.category_id,
            discount_type=item.discount_type,
            discount_value=item.discount_value,
            min_quantity=item.min_quantity,
            max_quantity=item.max_quantity,
        )
        for item in payload.items
    ]
    created = await service.create(promotion, items)
    return _to_detail_read(created, items)


@router.put("/{promotion_id}", response_model=PromotionDetailRead)
async def update_promotion(
    promotion_id: int,
    payload: PromotionUpdate,
    service: PromotionService = Depends(get_promotion_service),
) -> PromotionDetailRead:
    promotion = Promotion(
        name=payload.name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        active=payload.active,
    )
    items = [
        PromotionItem(
            promotion_id=None,
            product_id=item.product_id,
            category_id=item.category_id,
            discount_type=item.discount_type,
            discount_value=item.discount_value,
            min_quantity=item.min_quantity,
            max_quantity=item.max_quantity,
        )
        for item in payload.items
    ]
    updated = await service.update(promotion_id, promotion, items)
    return _to_detail_read(updated, items)


@router.delete("/{promotion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promotion(
    promotion_id: int, service: PromotionService = Depends(get_promotion_service)
) -> None:
    await service.delete(promotion_id)


def _to_detail_read(promotion: Promotion, items: list[PromotionItem]) -> PromotionDetailRead:
    return PromotionDetailRead(
        id=promotion.id,
        name=promotion.name,
        start_date=promotion.start_date,
        end_date=promotion.end_date,
        active=promotion.active,
        items=[PromotionItemRead.model_validate(item) for item in items],
    )
