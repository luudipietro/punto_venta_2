from fastapi import APIRouter, Depends, status

from app.core.auth import require_admin
from app.domain.brand_settings import BrandSettings
from app.schemas.brand_settings_schema import (
    BrandSettingsRead,
    BrandSettingsUpdate,
    DiscardUploadRequest,
)
from app.services.brand_settings_service import BrandSettingsService, get_brand_settings_service

router = APIRouter(prefix="/brand-settings", tags=["Brand Settings"])


@router.get("", response_model=BrandSettingsRead)
async def get_brand_settings(
    service: BrandSettingsService = Depends(get_brand_settings_service),
) -> BrandSettings:
    return await service.get()


@router.put("", response_model=BrandSettingsRead, dependencies=[Depends(require_admin)])
async def update_brand_settings(
    payload: BrandSettingsUpdate,
    service: BrandSettingsService = Depends(get_brand_settings_service),
) -> BrandSettings:
    colors = payload.colors.model_dump() if payload.colors else None
    return await service.update(
        payload.company_name,
        payload.logo_url,
        colors,
        payload.whatsapp_number,
        payload.hero_images,
        payload.social_links,
    )


@router.post(
    "/discard-upload",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def discard_upload(
    payload: DiscardUploadRequest,
    service: BrandSettingsService = Depends(get_brand_settings_service),
) -> None:
    await service.discard_upload(payload.url)
