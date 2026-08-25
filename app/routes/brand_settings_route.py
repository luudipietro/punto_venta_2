from fastapi import APIRouter, Depends

from app.core.auth import require_admin
from app.domain.brand_settings import BrandSettings
from app.schemas.brand_settings_schema import BrandSettingsRead, BrandSettingsUpdate
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
    return await service.update(payload.company_name, payload.logo_url)
