from fastapi import APIRouter, Depends, status

from app.domain.promotion import Promotion
from app.schemas.promotion_schema import PromotionCreate, PromotionRead, PromotionUpdate
from app.services.promotion_service import PromotionService, get_promotion_service

router = APIRouter(prefix="/promotions", tags=["Promotions"])


@router.get("", response_model=list[PromotionRead])
async def list_promotions(
    service: PromotionService = Depends(get_promotion_service),
) -> list[Promotion]:
    return await service.list_all()


@router.get("/{promotion_id}", response_model=PromotionRead)
async def get_promotion(
    promotion_id: int, service: PromotionService = Depends(get_promotion_service)
) -> Promotion:
    return await service.get_by_id(promotion_id)


@router.post("", response_model=PromotionRead, status_code=status.HTTP_201_CREATED)
async def create_promotion(
    payload: PromotionCreate, service: PromotionService = Depends(get_promotion_service)
) -> Promotion:
    return await service.create(Promotion(**payload.model_dump()))


@router.put("/{promotion_id}", response_model=PromotionRead)
async def update_promotion(
    promotion_id: int,
    payload: PromotionUpdate,
    service: PromotionService = Depends(get_promotion_service),
) -> Promotion:
    return await service.update(promotion_id, Promotion(**payload.model_dump()))


@router.delete("/{promotion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promotion(
    promotion_id: int, service: PromotionService = Depends(get_promotion_service)
) -> None:
    await service.delete(promotion_id)
