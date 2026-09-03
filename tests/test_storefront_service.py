from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.category import Category
from app.domain.product import Product
from app.domain.promotion import DiscountType, Promotion
from app.domain.promotion_item import PromotionItem
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.product_image_repository import SqlAlchemyProductImageRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.promotion_item_repository import SqlAlchemyPromotionItemRepository
from app.repositories.promotion_repository import SqlAlchemyPromotionRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.schemas.storefront_schema import CartPreviewItem
from app.services.promotion_service import PromotionService
from app.services.storefront_service import StorefrontService


def _build_storefront_service(session: AsyncSession) -> StorefrontService:
    return StorefrontService(
        SqlAlchemyProductRepository(session),
        SqlAlchemyStockRepository(session),
        SqlAlchemyCategoryRepository(session),
        SqlAlchemyColorRepository(session),
        SqlAlchemySizeRepository(session),
        SqlAlchemyProductImageRepository(session),
        PromotionService(
            SqlAlchemyPromotionRepository(session),
            SqlAlchemyPromotionItemRepository(session),
            SqlAlchemyProductRepository(session),
            SqlAlchemyCategoryRepository(session),
        ),
    )


async def _seed_product(session: AsyncSession, **overrides: object) -> Product:
    category = await SqlAlchemyCategoryRepository(session).create(Category(name="Remeras"))
    defaults: dict[str, object] = {
        "name": "Remera",
        "category_id": category.id,
        "cost": Decimal("10.00"),
        "price": Decimal("20.00"),
    }
    defaults.update(overrides)
    return await SqlAlchemyProductRepository(session).create(Product(**defaults))  # type: ignore[arg-type]


async def test_preview_cart_applies_active_promotion(db_session: AsyncSession) -> None:
    product = await _seed_product(db_session)
    today = date.today()
    promotion_service = PromotionService(
        SqlAlchemyPromotionRepository(db_session),
        SqlAlchemyPromotionItemRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyCategoryRepository(db_session),
    )
    await promotion_service.create(
        Promotion(name="10% Remeras", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=product.id,
            )
        ],
    )

    service = _build_storefront_service(db_session)
    result = await service.preview_cart([CartPreviewItem(product_id=product.id, quantity=2)])

    assert result.subtotal == Decimal("40.00")
    assert result.promotion_discount == Decimal("4.00")
    assert result.total == Decimal("36.00")
    assert len(result.applied_promotions) == 1
    assert result.applied_promotions[0].name == "10% Remeras"
    assert result.applied_promotions[0].discount_amount == Decimal("4.00")


async def test_preview_cart_with_no_matching_promotion(db_session: AsyncSession) -> None:
    product = await _seed_product(db_session)
    service = _build_storefront_service(db_session)

    result = await service.preview_cart([CartPreviewItem(product_id=product.id, quantity=3)])

    assert result.subtotal == Decimal("60.00")
    assert result.promotion_discount == Decimal("0")
    assert result.total == Decimal("60.00")
    assert result.applied_promotions == []


async def test_preview_cart_excludes_price_hidden_product(db_session: AsyncSession) -> None:
    product = await _seed_product(db_session, price_hidden_from_storefront=True)
    service = _build_storefront_service(db_session)

    result = await service.preview_cart([CartPreviewItem(product_id=product.id, quantity=1)])

    assert result.subtotal == Decimal("0")
    assert result.total == Decimal("0")
    assert result.applied_promotions == []


async def test_preview_cart_excludes_hidden_product(db_session: AsyncSession) -> None:
    product = await _seed_product(db_session, hidden_from_storefront=True)
    service = _build_storefront_service(db_session)

    result = await service.preview_cart([CartPreviewItem(product_id=product.id, quantity=1)])

    assert result.subtotal == Decimal("0")
    assert result.total == Decimal("0")
