import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.core.security import verify_password
from app.domain.branch import Branch
from app.domain.user import UserRole
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.user_repository import SqlAlchemyUserRepository
from app.services.user_service import UserService


def _build_user_service(session: AsyncSession) -> UserService:
    return UserService(SqlAlchemyUserRepository(session), SqlAlchemyBranchRepository(session))


async def test_create_empleado_without_branch_raises(db_session: AsyncSession) -> None:
    service = _build_user_service(db_session)

    with pytest.raises(BusinessRuleViolationError):
        await service.create("empleado1", "pass1234", UserRole.EMPLEADO, None)


async def test_create_admin_with_branch_raises(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    service = _build_user_service(db_session)

    with pytest.raises(BusinessRuleViolationError):
        await service.create("admin2", "pass1234", UserRole.ADMIN, branch.id)


async def test_create_empleado_with_unknown_branch_raises(db_session: AsyncSession) -> None:
    service = _build_user_service(db_session)

    with pytest.raises(EntityNotFoundError):
        await service.create("empleado1", "pass1234", UserRole.EMPLEADO, 999)


async def test_create_and_authenticate_user(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    service = _build_user_service(db_session)

    created = await service.create("empleado1", "pass1234", UserRole.EMPLEADO, branch.id)
    assert created.id is not None
    assert verify_password("pass1234", created.password_hash)

    authenticated = await service.authenticate("empleado1", "pass1234")
    assert authenticated.id == created.id


async def test_authenticate_with_wrong_password_raises(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    service = _build_user_service(db_session)
    await service.create("empleado1", "pass1234", UserRole.EMPLEADO, branch.id)

    with pytest.raises(BusinessRuleViolationError):
        await service.authenticate("empleado1", "wrong-password")


async def test_authenticate_unknown_username_raises(db_session: AsyncSession) -> None:
    service = _build_user_service(db_session)

    with pytest.raises(BusinessRuleViolationError):
        await service.authenticate("nobody", "pass1234")


async def test_create_duplicate_username_raises(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    service = _build_user_service(db_session)
    await service.create("empleado1", "pass1234", UserRole.EMPLEADO, branch.id)

    with pytest.raises(BusinessRuleViolationError):
        await service.create("empleado1", "otherpass", UserRole.EMPLEADO, branch.id)


async def test_update_user_without_password_keeps_existing_hash(db_session: AsyncSession) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    service = _build_user_service(db_session)
    created = await service.create("empleado1", "pass1234", UserRole.EMPLEADO, branch.id)

    updated = await service.update(created.id, "empleado1", UserRole.EMPLEADO, branch.id)

    assert updated.password_hash == created.password_hash
    assert await service.authenticate("empleado1", "pass1234")
