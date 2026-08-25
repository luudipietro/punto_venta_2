from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError
from app.domain.branch import Branch
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.services.base_service import CrudService


class BranchService(CrudService[Branch]):
    entity_name = "Branch"

    async def delete(self, entity_id: int) -> None:
        try:
            await super().delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: esta sucursal tiene stock, ventas, compras o "
                "gastos asociados"
            ) from exc


def get_branch_service(session: AsyncSession = Depends(get_db)) -> BranchService:
    return BranchService(SqlAlchemyBranchRepository(session))
