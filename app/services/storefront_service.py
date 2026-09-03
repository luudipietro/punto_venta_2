from datetime import date
from decimal import Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.stock import Stock
from app.infrastructure.db.session import get_db
from app.repositories.category_repository import CategoryRepository, SqlAlchemyCategoryRepository
from app.repositories.color_repository import ColorRepository, SqlAlchemyColorRepository
from app.repositories.product_image_repository import (
    ProductImageRepository,
    SqlAlchemyProductImageRepository,
)
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.repositories.promotion_item_repository import SqlAlchemyPromotionItemRepository
from app.repositories.promotion_repository import SqlAlchemyPromotionRepository
from app.repositories.size_repository import SizeRepository, SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository, StockRepository
from app.schemas.storefront_schema import (
    AppliedPromotionRead,
    CartPreviewItem,
    CartPreviewResponse,
    StorefrontProductRead,
    StorefrontVariantRead,
)
from app.services.promotion_service import PromotionService


class StorefrontService:
    """Public, read-only projection of the catalog for the customer-facing
    storefront (no login, no branch scoping — there is no authenticated user
    at all on this path). Composes Product/Stock/Category/Color/Size in
    memory, same "acceptable at this scale" approach as ReportService.
    Stock is summed across every branch — the storefront is a catalog that
    hands off to WhatsApp, not a live checkout, so there's no oversell risk
    that would require picking a single "online" branch."""

    def __init__(
        self,
        products: ProductRepository,
        stocks: StockRepository,
        categories: CategoryRepository,
        colors: ColorRepository,
        sizes: SizeRepository,
        images: ProductImageRepository,
        promotions: PromotionService,
    ) -> None:
        self._products = products
        self._stocks = stocks
        self._categories = categories
        self._colors = colors
        self._sizes = sizes
        self._images = images
        self._promotions = promotions

    async def list_products(self) -> list[StorefrontProductRead]:
        products = await self._products.list_all()
        stocks = await self._stocks.list_all()
        category_names = {c.id: c.name for c in await self._categories.list_all()}
        colors = {c.id: c for c in await self._colors.list_all()}
        size_labels = {s.id: s.label for s in await self._sizes.list_all()}

        stocks_by_product: dict[int, list[Stock]] = {}
        for stock in stocks:
            stocks_by_product.setdefault(stock.product_id, []).append(stock)

        result = []
        for product in products:
            if product.hidden_from_storefront:
                continue
            variants = [
                StorefrontVariantRead(
                    stock_id=stock.id,  # type: ignore[arg-type]
                    color_name=colors[stock.color_id].name if stock.color_id else None,
                    color_hex=colors[stock.color_id].hex_code if stock.color_id else None,
                    size_label=size_labels.get(stock.size_id) if stock.size_id else None,
                    quantity=stock.quantity,
                )
                for stock in stocks_by_product.get(product.id, [])
                if stock.quantity > 0
            ]
            gallery = await self._images.list_by_product(product.id)  # type: ignore[arg-type]
            result.append(
                StorefrontProductRead(
                    id=product.id,  # type: ignore[arg-type]
                    name=product.name,
                    description=product.description,
                    price=None if product.price_hidden_from_storefront else product.price,
                    image_url=product.image_url,
                    gallery_urls=[image.url for image in gallery],
                    category_name=category_names.get(product.category_id)
                    if product.category_id
                    else None,
                    variants=variants,
                    in_stock=len(variants) > 0,
                )
            )
        return result

    async def preview_cart(self, items: list[CartPreviewItem]) -> CartPreviewResponse:
        """Computes a promotion-aware total for a storefront cart, reusing
        the same `PromotionService.select_winning_applications` engine the
        real POS sale flow uses — the engine only ever needs
        product_id/quantity/category_id/unit_price (see its own signature),
        so unlike `SaleService.compute_totals` there's no Stock→Product hop
        or branch_id needed here at all."""
        cart_quantities: dict[int, int] = {}
        cart_categories: dict[int, int] = {}
        cart_unit_prices: dict[int, Decimal] = {}

        for item in items:
            product = await self._products.get_by_id(item.product_id)
            if product is None:
                continue
            # A price-hidden product must never have its price implied by a
            # computed total — excluded here too, not just by the frontend
            # not sending it (a stale cart could still reference one the
            # admin hid or price-hid after it was added).
            if product.hidden_from_storefront or product.price_hidden_from_storefront:
                continue
            cart_quantities[item.product_id] = (
                cart_quantities.get(item.product_id, 0) + item.quantity
            )
            if product.category_id is not None:
                cart_categories[item.product_id] = product.category_id
            cart_unit_prices[item.product_id] = product.price

        subtotal = sum(
            (
                cart_unit_prices[product_id] * quantity
                for product_id, quantity in cart_quantities.items()
            ),
            Decimal("0"),
        )

        applications = await self._promotions.select_winning_applications(
            cart_quantities, cart_categories, cart_unit_prices, date.today()
        )

        discount_by_promotion: dict[int, Decimal] = {}
        for application in applications:
            discount_by_promotion[application.promotion_id] = (
                discount_by_promotion.get(application.promotion_id, Decimal("0"))
                + application.discount_amount
            )

        applied_promotions = []
        for promotion_id, discount_amount in discount_by_promotion.items():
            promotion = await self._promotions.get_by_id(promotion_id)
            applied_promotions.append(
                AppliedPromotionRead(
                    promotion_id=promotion_id, name=promotion.name, discount_amount=discount_amount
                )
            )

        promotion_discount = sum(discount_by_promotion.values(), Decimal("0"))
        return CartPreviewResponse(
            subtotal=subtotal,
            promotion_discount=promotion_discount,
            total=subtotal - promotion_discount,
            applied_promotions=applied_promotions,
        )


def get_storefront_service(session: AsyncSession = Depends(get_db)) -> StorefrontService:
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
