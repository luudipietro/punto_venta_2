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
from app.domain.user import User
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import BranchRepository, SqlAlchemyBranchRepository
from app.repositories.color_repository import ColorRepository, SqlAlchemyColorRepository
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.repositories.size_repository import SizeRepository, SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository, StockRepository
from app.services.audit_log_service import AuditLogService, get_audit_log_service
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
        audit: AuditLogService | None = None,
    ) -> None:
        super().__init__(repository, audit)
        self._product_repository = product_repository
        self._color_repository = color_repository
        self._size_repository = size_repository
        self._branch_repository = branch_repository

    async def create(self, stock: Stock, *, acting_user: User | None = None) -> Stock:
        await self._ensure_references_exist(stock)
        try:
            return await super().create(stock, acting_user=acting_user)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "Ya existe un stock para ese producto, color, talle y sucursal"
            ) from exc

    async def update(
        self, entity_id: int, stock: Stock, *, acting_user: User | None = None
    ) -> Stock:
        await self._ensure_references_exist(stock)
        return await super().update(entity_id, stock, acting_user=acting_user)

    async def delete(self, entity_id: int, *, acting_user: User | None = None) -> None:
        try:
            await super().delete(entity_id, acting_user=acting_user)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: este stock tiene ventas, compras o cambios asociados"
            ) from exc

    async def decrease_quantity(
        self,
        stock_id: int,
        amount: int,
        *,
        acting_branch_id: int | None = None,
        acting_user: User | None = None,
    ) -> Stock:
        stock = await self.get_by_id(stock_id)
        self._check_branch(stock, acting_branch_id)
        if stock.quantity < amount:
            raise InsufficientStockError(stock_id, amount, stock.quantity)
        stock.quantity -= amount
        updated = await self._repository.update(stock)
        # Only manual adjustments (StockPage's +/- buttons) pass acting_user —
        # a sale/purchase/exchange's own automatic stock decrements don't, so
        # they don't flood the audit log with a redundant per-line entry
        # (the Sale/Purchase/Exchange itself is already logged separately).
        if self._audit is not None and acting_user is not None:
            await self._audit.record(
                acting_user,
                "stock.decrease",
                self.entity_name,
                stock_id,
                branch_id=stock.branch_id,
                summary=f"Restó {amount} unidad(es) de stock #{stock_id}",
            )
        return updated

    async def increase_quantity(
        self,
        stock_id: int,
        amount: int,
        *,
        acting_branch_id: int | None = None,
        acting_user: User | None = None,
    ) -> Stock:
        stock = await self.get_by_id(stock_id)
        self._check_branch(stock, acting_branch_id)
        stock.quantity += amount
        updated = await self._repository.update(stock)
        if self._audit is not None and acting_user is not None:
            await self._audit.record(
                acting_user,
                "stock.increase",
                self.entity_name,
                stock_id,
                branch_id=stock.branch_id,
                summary=f"Sumó {amount} unidad(es) de stock #{stock_id}",
            )
        return updated

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


def get_stock_service(
    session: AsyncSession = Depends(get_db),
    audit: AuditLogService = Depends(get_audit_log_service),
) -> StockService:
    return StockService(
        SqlAlchemyStockRepository(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyColorRepository(session),
        SqlAlchemySizeRepository(session),
        SqlAlchemyBranchRepository(session),
        audit,
    )
