from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    BusinessRuleViolationError,
    EntityNotFoundError,
    InsufficientStockError,
    PermissionDeniedError,
)
from app.domain.stock import Stock
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import BranchRepository, SqlAlchemyBranchRepository
from app.repositories.color_repository import ColorRepository, SqlAlchemyColorRepository
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.repositories.size_repository import SizeRepository, SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository, StockRepository
from app.services.base_service import CrudService


class StockService(CrudService[Stock]):
    entity_name = "Stock"

    def __init__(
        self,
        repository: StockRepository,
        product_repository: ProductRepository,
        color_repository: ColorRepository,
        size_repository: SizeRepository,
        branch_repository: BranchRepository,
    ) -> None:
        super().__init__(repository)
        self._product_repository = product_repository
        self._color_repository = color_repository
        self._size_repository = size_repository
        self._branch_repository = branch_repository

    async def create(self, stock: Stock) -> Stock:
        await self._ensure_references_exist(stock)
        try:
            return await super().create(stock)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "Ya existe un stock para ese producto, color, talle y sucursal"
            ) from exc

    async def update(self, entity_id: int, stock: Stock) -> Stock:
        await self._ensure_references_exist(stock)
        return await super().update(entity_id, stock)

    async def delete(self, entity_id: int) -> None:
        try:
            await super().delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: este stock tiene ventas, compras o cambios asociados"
            ) from exc

    async def decrease_quantity(
        self, stock_id: int, amount: int, *, acting_branch_id: int | None = None
    ) -> Stock:
        stock = await self.get_by_id(stock_id)
        self._check_branch(stock, acting_branch_id)
        if stock.quantity < amount:
            raise InsufficientStockError(stock_id, amount, stock.quantity)
        stock.quantity -= amount
        return await self._repository.update(stock)

    async def increase_quantity(
        self, stock_id: int, amount: int, *, acting_branch_id: int | None = None
    ) -> Stock:
        stock = await self.get_by_id(stock_id)
        self._check_branch(stock, acting_branch_id)
        stock.quantity += amount
        return await self._repository.update(stock)

    @staticmethod
    def _check_branch(stock: Stock, acting_branch_id: int | None) -> None:
        """`acting_branch_id=None` means no restriction (admin, or an
        internal call already gated by a higher-level check — e.g. a sale's
        own stock decrements after `create_sale` already validated the sale's
        branch)."""
        if acting_branch_id is not None and stock.branch_id != acting_branch_id:
            raise PermissionDeniedError(
                f"No podés modificar stock de otra sucursal (stock {stock.id} pertenece a "
                f"la sucursal {stock.branch_id})"
            )

    async def _ensure_references_exist(self, stock: Stock) -> None:
        if await self._product_repository.get_by_id(stock.product_id) is None:
            raise EntityNotFoundError("Product", stock.product_id)
        if stock.color_id is not None:
            if await self._color_repository.get_by_id(stock.color_id) is None:
                raise EntityNotFoundError("Color", stock.color_id)
        if stock.size_id is not None:
            if await self._size_repository.get_by_id(stock.size_id) is None:
                raise EntityNotFoundError("Size", stock.size_id)
        if await self._branch_repository.get_by_id(stock.branch_id) is None:
            raise EntityNotFoundError("Branch", stock.branch_id)


def get_stock_service(session: AsyncSession = Depends(get_db)) -> StockService:
    return StockService(
        SqlAlchemyStockRepository(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyColorRepository(session),
        SqlAlchemySizeRepository(session),
        SqlAlchemyBranchRepository(session),
    )
