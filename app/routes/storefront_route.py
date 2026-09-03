from fastapi import APIRouter, Depends

from app.schemas.storefront_schema import (
    CartPreviewRequest,
    CartPreviewResponse,
    StorefrontProductRead,
)
from app.services.storefront_service import StorefrontService, get_storefront_service

router = APIRouter(prefix="/storefront", tags=["Storefront"])


@router.get("/products", response_model=list[StorefrontProductRead])
async def list_storefront_products(
    service: StorefrontService = Depends(get_storefront_service),
) -> list[StorefrontProductRead]:
    return await service.list_products()


@router.post("/cart/preview", response_model=CartPreviewResponse)
async def preview_storefront_cart(
    payload: CartPreviewRequest,
    service: StorefrontService = Depends(get_storefront_service),
) -> CartPreviewResponse:
    return await service.preview_cart(payload.items)
