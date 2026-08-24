from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.product import Product
from app.domain.promotion import DiscountType, Promotion
from app.domain.promotion_item import PromotionItem
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.promotion_item_repository import SqlAlchemyPromotionItemRepository
from app.repositories.promotion_repository import SqlAlchemyPromotionRepository
from app.services.promotion_service import PromotionService


async def _seed_product(session: AsyncSession, name: str = "Remera") -> Product:
    category = await SqlAlchemyCategoryRepository(session).create(Category(name=f"{name}-cat"))
    brand = await SqlAlchemyBrandRepository(session).create(Brand(name=f"{name}-brand"))
    return await SqlAlchemyProductRepository(session).create(
        Product(
            name=name,
            category_id=category.id,
            brand_id=brand.id,
            cost=Decimal("10.00"),
            price=Decimal("20.00"),
        )
    )


def _build_promotion_service(session: AsyncSession) -> PromotionService:
    return PromotionService(
        SqlAlchemyPromotionRepository(session),
        SqlAlchemyPromotionItemRepository(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyCategoryRepository(session),
    )


async def test_create_promotion_requires_at_least_one_item(db_session: AsyncSession) -> None:
    service = _build_promotion_service(db_session)
    today = date.today()

    with pytest.raises(BusinessRuleViolationError):
        await service.create(Promotion(name="Vacia", start_date=today, end_date=today), items=[])


async def test_create_promotion_item_requires_exactly_one_target(db_session: AsyncSession) -> None:
    product = await _seed_product(db_session)
    service = _build_promotion_service(db_session)
    today = date.today()

    with pytest.raises(BusinessRuleViolationError):
        await service.create(
            Promotion(name="Ambos", start_date=today, end_date=today),
            items=[
                PromotionItem(
                    promotion_id=None,
                    discount_type=DiscountType.PERCENTAGE,
                    discount_value=Decimal("10"),
                    product_id=product.id,
                    category_id=product.category_id,
                )
            ],
        )


async def test_create_promotion_persists_items(db_session: AsyncSession) -> None:
    product = await _seed_product(db_session)
    service = _build_promotion_service(db_session)
    today = date.today()

    promotion = await service.create(
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

    items = await service.get_items(promotion.id)
    assert len(items) == 1
    assert items[0].product_id == product.id
    assert items[0].promotion_id == promotion.id


async def test_update_promotion_can_remove_an_item(db_session: AsyncSession) -> None:
    product_a = await _seed_product(db_session, name="Remera")
    product_b = await _seed_product(db_session, name="Short")
    product_c = await _seed_product(db_session, name="Medias")
    service = _build_promotion_service(db_session)
    today = date.today()

    promotion = await service.create(
        Promotion(name="Combo", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=product_a.id,
            ),
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("20"),
                product_id=product_b.id,
            ),
        ],
    )
    assert len(await service.get_items(promotion.id)) == 2

    # Edit: drop the product_b line, keep product_a, add a brand-new product_c line.
    await service.update(
        promotion.id,
        Promotion(name="Combo", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=product_a.id,
            ),
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.FIXED_AMOUNT,
                discount_value=Decimal("5"),
                product_id=product_c.id,
            ),
        ],
    )

    items = await service.get_items(promotion.id)
    target_product_ids = {item.product_id for item in items}
    assert len(items) == 2
    assert target_product_ids == {product_a.id, product_c.id}
    assert product_b.id not in target_product_ids


async def test_select_winning_applications_single_line_promotion(db_session: AsyncSession) -> None:
    product = await _seed_product(db_session)
    service = _build_promotion_service(db_session)
    today = date.today()

    await service.create(
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

    applications = await service.select_winning_applications(
        cart_quantities={product.id: 1},
        cart_categories={product.id: product.category_id},
        cart_unit_prices={product.id: Decimal("20.00")},
        on_date=today,
    )

    assert len(applications) == 1
    assert applications[0].discount_amount == Decimal("2.00")


async def test_select_winning_applications_ignores_out_of_range_promotion(
    db_session: AsyncSession,
) -> None:
    product = await _seed_product(db_session)
    service = _build_promotion_service(db_session)
    today = date.today()
    yesterday = today - timedelta(days=1)

    await service.create(
        Promotion(
            name="Vencida",
            start_date=yesterday - timedelta(days=10),
            end_date=yesterday,
        ),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.FIXED_AMOUNT,
                discount_value=Decimal("5"),
                product_id=product.id,
            )
        ],
    )

    applications = await service.select_winning_applications(
        cart_quantities={product.id: 1},
        cart_categories={product.id: product.category_id},
        cart_unit_prices={product.id: Decimal("20.00")},
        on_date=today,
    )

    assert applications == []


async def test_select_winning_applications_picks_highest_total_discount_in_overlapping_group(
    db_session: AsyncSession,
) -> None:
    shorts = await _seed_product(db_session, "Short")
    shirt = await _seed_product(db_session, "Remera")
    socks = await _seed_product(db_session, "Medias")
    service = _build_promotion_service(db_session)
    today = date.today()

    cart_quantities = {shorts.id: 1, shirt.id: 1, socks.id: 1}
    cart_categories = {
        shorts.id: shorts.category_id,
        shirt.id: shirt.category_id,
        socks.id: socks.category_id,
    }
    cart_unit_prices = {
        shorts.id: Decimal("30.00"),
        shirt.id: Decimal("20.00"),
        socks.id: Decimal("5.00"),
    }

    # (a) 10% off shirt alone -> 2.00
    await service.create(
        Promotion(name="10% Remera sola", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=shirt.id,
            )
        ],
    )
    # (b) 15% off shorts+shirt combo -> 4.50 + 3.00 = 7.50
    combo_ab = await service.create(
        Promotion(name="15% Short+Remera", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("15"),
                product_id=shorts.id,
            ),
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("15"),
                product_id=shirt.id,
            ),
        ],
    )
    # (c) 10% off shorts+shirt+socks combo -> 3.00 + 2.00 + 0.50 = 5.50
    await service.create(
        Promotion(name="10% Short+Remera+Medias", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=shorts.id,
            ),
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=shirt.id,
            ),
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=socks.id,
            ),
        ],
    )

    applications = await service.select_winning_applications(
        cart_quantities, cart_categories, cart_unit_prices, today
    )

    assert {a.promotion_id for a in applications} == {combo_ab.id}
    assert sum((a.discount_amount for a in applications), Decimal("0")) == Decimal("7.50")


async def test_select_winning_applications_disjoint_promotions_both_apply(
    db_session: AsyncSession,
) -> None:
    shirt = await _seed_product(db_session, "Remera")
    hat = await _seed_product(db_session, "Gorra")
    service = _build_promotion_service(db_session)
    today = date.today()

    cart_quantities = {shirt.id: 1, hat.id: 1}
    cart_categories = {shirt.id: shirt.category_id, hat.id: hat.category_id}
    cart_unit_prices = {shirt.id: Decimal("20.00"), hat.id: Decimal("10.00")}

    shirt_promo = await service.create(
        Promotion(name="10% Remera", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("10"),
                product_id=shirt.id,
            )
        ],
    )
    hat_promo = await service.create(
        Promotion(name="20% Gorra", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("20"),
                product_id=hat.id,
            )
        ],
    )

    applications = await service.select_winning_applications(
        cart_quantities, cart_categories, cart_unit_prices, today
    )

    assert {a.promotion_id for a in applications} == {shirt_promo.id, hat_promo.id}


async def test_select_winning_applications_gift_line_differing_discount_per_line(
    db_session: AsyncSession,
) -> None:
    shirt = await _seed_product(db_session, "Remera")
    socks = await _seed_product(db_session, "Medias")
    service = _build_promotion_service(db_session)
    today = date.today()

    cart_quantities = {shirt.id: 1, socks.id: 3}
    cart_categories = {shirt.id: shirt.category_id, socks.id: socks.category_id}
    cart_unit_prices = {shirt.id: Decimal("20.00"), socks.id: Decimal("5.00")}

    gift_promo = await service.create(
        Promotion(name="Remera + medias de regalo", start_date=today, end_date=today),
        items=[
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("0"),
                product_id=shirt.id,
                min_quantity=1,
            ),
            PromotionItem(
                promotion_id=None,
                discount_type=DiscountType.PERCENTAGE,
                discount_value=Decimal("100"),
                product_id=socks.id,
                min_quantity=1,
                max_quantity=1,
            ),
        ],
    )

    applications = await service.select_winning_applications(
        cart_quantities, cart_categories, cart_unit_prices, today
    )

    assert {a.promotion_id for a in applications} == {gift_promo.id}
    by_product = {a.product_id: a for a in applications}
    assert by_product[shirt.id].discount_amount == Decimal("0.00")
    # Only 1 pair of socks (min_quantity) is discounted, not all 3 in the cart.
    assert by_product[socks.id].discount_amount == Decimal("5.00")
    assert by_product[socks.id].quantity == 1
