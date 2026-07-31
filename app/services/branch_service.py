from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.branch import Branch
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.services.base_service import CrudService


class BranchService(CrudService[Branch]):
    entity_name = "Branch"


def get_branch_service(session: AsyncSession = Depends(get_db)) -> BranchService:
    return BranchService(SqlAlchemyBranchRepository(session))
