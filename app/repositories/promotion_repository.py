from abc import ABC, abstractmethod
from datetime import date

from sqlalchemy import select

from app.domain.promotion import Promotion
from app.infrastructure.db.models.promotion_model import PromotionModel
from app.repositories.base_repository import SqlAlchemyRepository


class PromotionRepository(ABC):
    @abstractmethod
    async def list_all(self) -> list[Promotion]: ...

    @abstractmethod
    async def get_by_id(self, promotion_id: int) -> Promotion | None: ...

    @abstractmethod
    async def list_active(self, on_date: date) -> list[Promotion]: ...

    @abstractmethod
    async def create(self, promotion: Promotion) -> Promotion: ...

    @abstractmethod
    async def update(self, promotion: Promotion) -> Promotion: ...

    @abstractmethod
    async def delete(self, promotion_id: int) -> None: ...


class SqlAlchemyPromotionRepository(SqlAlchemyRepository[PromotionModel], PromotionRepository):
    model = PromotionModel

    async def list_all(self) -> list[Promotion]:
        return [self._to_domain(model) for model in await self._list_models()]

    async def get_by_id(self, promotion_id: int) -> Promotion | None:
        model = await self._get_model(promotion_id)
        return self._to_domain(model) if model else None

    async def list_active(self, on_date: date) -> list[Promotion]:
        result = await self._session.execute(
            select(PromotionModel).where(
                PromotionModel.active.is_(True),
                PromotionModel.start_date <= on_date,
                PromotionModel.end_date >= on_date,
            )
        )
        return [self._to_domain(model) for model in result.scalars().all()]

    async def create(self, promotion: Promotion) -> Promotion:
        model = PromotionModel(
            name=promotion.name,
            discount_type=promotion.discount_type,
            discount_value=promotion.discount_value,
            start_date=promotion.start_date,
            end_date=promotion.end_date,
            active=promotion.active,
            product_id=promotion.product_id,
            category_id=promotion.category_id,
        )
        self._session.add(model)
        await self._session.flush()
        return self._to_domain(model)

    async def update(self, promotion: Promotion) -> Promotion:
        model = await self._get_model(promotion.id)
        model.name = promotion.name
        model.discount_type = promotion.discount_type
        model.discount_value = promotion.discount_value
        model.start_date = promotion.start_date
        model.end_date = promotion.end_date
        model.active = promotion.active
        model.product_id = promotion.product_id
        model.category_id = promotion.category_id
        await self._session.flush()
        return self._to_domain(model)

    async def delete(self, promotion_id: int) -> None:
        model = await self._get_model(promotion_id)
        if model is not None:
            await self._delete_model(model)

    @staticmethod
    def _to_domain(model: PromotionModel) -> Promotion:
        return Promotion(
            id=model.id,
            name=model.name,
            discount_type=model.discount_type,
            discount_value=model.discount_value,
            start_date=model.start_date,
            end_date=model.end_date,
            active=model.active,
            product_id=model.product_id,
            category_id=model.category_id,
        )
