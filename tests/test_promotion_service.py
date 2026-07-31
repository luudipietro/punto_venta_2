from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.product import Product
from app.domain.promotion import DiscountType, Promotion
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.promotion_repository import SqlAlchemyPromotionRepository
from app.services.promotion_service import PromotionService


async def _seed_product(session: AsyncSession) -> Product:
    category = await SqlAlchemyCategoryRepository(session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(session).create(Brand(name="Nike"))
    return await SqlAlchemyProductRepository(session).create(
        Product(
            name="Remera",
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10.00"),
            price=Decimal("20.00"),
        )
    )


def _build_promotion_service(session: AsyncSession) -> PromotionService:
    return PromotionService(
        SqlAlchemyPromotionRepository(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyCategoryRepository(session),
    )


async def test_find_applicable_prefers_product_specific_over_category(
    db_session: AsyncSession,
) -> None:
    product = await _seed_product(db_session)
    service = _build_promotion_service(db_session)
    today = date.today()
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)

    await service.create(
        Promotion(
            name="Categoria 5%",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("5"),
            start_date=yesterday,
            end_date=tomorrow,
            category_id=product.category_id,
        )
    )
    product_promotion = await service.create(
        Promotion(
            name="Producto 10%",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10"),
            start_date=yesterday,
            end_date=tomorrow,
            product_id=product.id,
        )
    )

    applicable = await service.find_applicable(product.id, product.category_id, today)

    assert applicable is not None
    assert applicable.id == product_promotion.id


async def test_find_applicable_ignores_out_of_range_promotion(db_session: AsyncSession) -> None:
    product = await _seed_product(db_session)
    service = _build_promotion_service(db_session)
    today = date.today()
    yesterday = today - timedelta(days=1)

    await service.create(
        Promotion(
            name="Vencida",
            discount_type=DiscountType.FIXED_AMOUNT,
            discount_value=Decimal("5"),
            start_date=yesterday - timedelta(days=10),
            end_date=yesterday,
            product_id=product.id,
        )
    )

    applicable = await service.find_applicable(product.id, product.category_id, today)

    assert applicable is None


async def test_find_applicable_ignores_inactive_promotion(db_session: AsyncSession) -> None:
    product = await _seed_product(db_session)
    service = _build_promotion_service(db_session)
    today = date.today()

    await service.create(
        Promotion(
            name="Inactiva",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("10"),
            start_date=today,
            end_date=today,
            active=False,
            product_id=product.id,
        )
    )

    applicable = await service.find_applicable(product.id, product.category_id, today)

    assert applicable is None
