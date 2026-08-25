from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.brand_settings import BrandSettings
from app.infrastructure.db.session import get_db
from app.repositories.brand_settings_repository import (
    BrandSettingsRepository,
    SqlAlchemyBrandSettingsRepository,
)

_DEFAULT = BrandSettings(company_name="Punto de Venta", logo_url="/brand/logo.svg")


class BrandSettingsService:
    def __init__(self, repository: BrandSettingsRepository) -> None:
        self._repository = repository

    async def get(self) -> BrandSettings:
        return await self._repository.get() or _DEFAULT

    async def update(self, company_name: str, logo_url: str) -> BrandSettings:
        return await self._repository.upsert(
            BrandSettings(company_name=company_name, logo_url=logo_url)
        )


def get_brand_settings_service(
    session: AsyncSession = Depends(get_db),
) -> BrandSettingsService:
    return BrandSettingsService(SqlAlchemyBrandSettingsRepository(session))
