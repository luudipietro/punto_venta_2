from abc import ABC, abstractmethod

from app.domain.brand_settings import BrandSettings
from app.infrastructure.db.models.brand_settings_model import BrandSettingsModel
from app.repositories.base_repository import SqlAlchemyRepository

_SINGLETON_ID = 1


class BrandSettingsRepository(ABC):
    @abstractmethod
    async def get(self) -> BrandSettings | None: ...

    @abstractmethod
    async def upsert(self, settings: BrandSettings) -> BrandSettings: ...


class SqlAlchemyBrandSettingsRepository(
    SqlAlchemyRepository[BrandSettingsModel], BrandSettingsRepository
):
    model = BrandSettingsModel

    async def get(self) -> BrandSettings | None:
        model = await self._get_model(_SINGLETON_ID)
        return self._to_domain(model) if model else None

    async def upsert(self, settings: BrandSettings) -> BrandSettings:
        model = await self._get_model(_SINGLETON_ID)
        if model is None:
            model = BrandSettingsModel(id=_SINGLETON_ID)
            self._session.add(model)
        model.company_name = settings.company_name
        model.logo_url = settings.logo_url
        model.colors = settings.colors
        model.whatsapp_number = settings.whatsapp_number
        model.hero_images = settings.hero_images
        model.social_links = settings.social_links
        await self._session.flush()
        return self._to_domain(model)

    @staticmethod
    def _to_domain(model: BrandSettingsModel) -> BrandSettings:
        return BrandSettings(
            id=model.id,
            company_name=model.company_name,
            logo_url=model.logo_url,
            colors=model.colors,
            whatsapp_number=model.whatsapp_number,
            hero_images=model.hero_images,
            social_links=model.social_links,
        )
