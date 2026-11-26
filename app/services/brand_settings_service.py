from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.media import delete_media_file
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

    async def discard_upload(self, url: str) -> None:
        """Deletes a file uploaded for the carousel and removed before ever
        being saved — `update` never sees it, so it would stay on disk forever.
        A no-op if the saved settings still use it."""
        current = await self._repository.get()
        if current and url in [current.logo_url, *(current.hero_images or [])]:
            return
        delete_media_file(url)

    async def update(
        self,
        company_name: str,
        logo_url: str,
        colors: dict | None = None,
        whatsapp_number: str | None = None,
        hero_images: list[str] | None = None,
        social_links: dict[str, str] | None = None,
    ) -> BrandSettings:
        previous = await self._repository.get()
        updated = await self._repository.upsert(
            BrandSettings(
                company_name=company_name,
                logo_url=logo_url,
                colors=colors,
                whatsapp_number=whatsapp_number,
                hero_images=hero_images,
                social_links=social_links,
            )
        )
        if previous and previous.logo_url != updated.logo_url:
            delete_media_file(previous.logo_url)
        if previous and previous.hero_images:
            removed = set(previous.hero_images) - set(updated.hero_images or [])
            for url in removed:
                delete_media_file(url)
        return updated


def get_brand_settings_service(
    session: AsyncSession = Depends(get_db),
) -> BrandSettingsService:
    return BrandSettingsService(SqlAlchemyBrandSettingsRepository(session))
