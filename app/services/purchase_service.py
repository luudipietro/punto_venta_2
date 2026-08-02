from decimal import Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.purchase import Purchase
from app.domain.purchase_item import PurchaseItem
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.purchase_item_repository import (
    PurchaseItemRepository,
    SqlAlchemyPurchaseItemRepository,
)
from app.repositories.purchase_repository import PurchaseRepository, SqlAlchemyPurchaseRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.stock_service import StockService


class PurchaseService:
    """Orchestrates the purchase creation transaction: computes totals,
    increments stock, and persists the purchase with its items as a single
    unit of work on the shared session."""

    def __init__(
        self,
        purchase_repository: PurchaseRepository,
        purchase_item_repository: PurchaseItemRepository,
        stock_service: StockService,
    ) -> None:
        self._purchase_repository = purchase_repository
        self._purchase_item_repository = purchase_item_repository
        self._stock_service = stock_service

    async def list_all(self) -> list[Purchase]:
        return await self._purchase_repository.list_all()

    async def get_by_id(self, purchase_id: int) -> Purchase:
        purchase = await self._purchase_repository.get_by_id(purchase_id)
        if purchase is None:
            raise EntityNotFoundError("Purchase", purchase_id)
        return purchase

    async def get_items(self, purchase_id: int) -> list[PurchaseItem]:
        return await self._purchase_item_repository.list_by_purchase(purchase_id)

    async def create_purchase(
        self,
        branch_id: int,
        supplier_name: str | None,
        items: list[PurchaseItem],
    ) -> Purchase:
        for item in items:
            stock = await self._stock_service.get_by_id(item.stock_id)
            if stock.branch_id != branch_id:
                raise BusinessRuleViolationError(
                    f"Stock {item.stock_id} belongs to branch {stock.branch_id}, not {branch_id}"
                )

        subtotal = sum((item.unit_cost * item.quantity for item in items), Decimal("0"))
        total = subtotal

        purchase = await self._purchase_repository.create(
            Purchase(
                branch_id=branch_id, supplier_name=supplier_name, subtotal=subtotal, total=total
            )
        )

        for item in items:
            await self._stock_service.increase_quantity(item.stock_id, item.quantity)
            item.purchase_id = purchase.id
            created_item = await self._purchase_item_repository.create(item)
            item.id = created_item.id

        return purchase


def get_purchase_service(session: AsyncSession = Depends(get_db)) -> PurchaseService:
    return PurchaseService(
        SqlAlchemyPurchaseRepository(session),
        SqlAlchemyPurchaseItemRepository(session),
        StockService(
            SqlAlchemyStockRepository(session),
            SqlAlchemyProductRepository(session),
            SqlAlchemyColorRepository(session),
            SqlAlchemySizeRepository(session),
            SqlAlchemyBranchRepository(session),
        ),
    )
