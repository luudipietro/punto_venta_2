from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.stock import Stock
from app.infrastructure.db.session import get_db
from app.repositories.category_repository import CategoryRepository, SqlAlchemyCategoryRepository
from app.repositories.color_repository import ColorRepository, SqlAlchemyColorRepository
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.repositories.size_repository import SizeRepository, SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository, StockRepository
from app.schemas.storefront_schema import StorefrontProductRead, StorefrontVariantRead


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
    ) -> None:
        self._products = products
        self._stocks = stocks
        self._categories = categories
        self._colors = colors
        self._sizes = sizes

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
            result.append(
                StorefrontProductRead(
                    id=product.id,  # type: ignore[arg-type]
                    name=product.name,
                    description=product.description,
                    price=None if product.price_hidden_from_storefront else product.price,
                    image_url=product.image_url,
                    category_name=category_names.get(product.category_id)
                    if product.category_id
                    else None,
                    variants=variants,
                    in_stock=len(variants) > 0,
                )
            )
        return result


def get_storefront_service(session: AsyncSession = Depends(get_db)) -> StorefrontService:
    return StorefrontService(
        SqlAlchemyProductRepository(session),
        SqlAlchemyStockRepository(session),
        SqlAlchemyCategoryRepository(session),
        SqlAlchemyColorRepository(session),
        SqlAlchemySizeRepository(session),
    )
