from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.branch import Branch
from app.domain.user import UserRole
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.user_repository import SqlAlchemyUserRepository
from app.services.user_service import UserService


async def _login(client_no_auth: AsyncClient, username: str, password: str) -> str:
    resp = await client_no_auth.post(
        "/auth/login", json={"username": username, "password": password}
    )
    return resp.json()["access_token"]


async def _seed_employee(db_session: AsyncSession, username: str, password: str) -> int:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    service = UserService(
        SqlAlchemyUserRepository(db_session), SqlAlchemyBranchRepository(db_session)
    )
    await service.create(username, password, UserRole.EMPLEADO, branch.id)
    await db_session.commit()
    return branch.id


async def test_unauthenticated_request_returns_401(client_no_auth: AsyncClient) -> None:
    resp = await client_no_auth.get("/products")

    assert resp.status_code == 401


async def test_employee_can_read_catalog(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_employee(db_session, "empleado1", "pass1234")
    token = await _login(client_no_auth, "empleado1", "pass1234")

    resp = await client_no_auth.get("/categories", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 200


async def test_employee_cannot_create_category(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_employee(db_session, "empleado1", "pass1234")
    token = await _login(client_no_auth, "empleado1", "pass1234")

    resp = await client_no_auth.post(
        "/categories",
        json={"name": "Ropa"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403


async def test_employee_cannot_create_branch(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_employee(db_session, "empleado1", "pass1234")
    token = await _login(client_no_auth, "empleado1", "pass1234")

    resp = await client_no_auth.post(
        "/branches",
        json={"name": "Sucursal Nueva"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403


async def test_employee_can_create_customer(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_employee(db_session, "empleado1", "pass1234")
    token = await _login(client_no_auth, "empleado1", "pass1234")

    resp = await client_no_auth.post(
        "/customers",
        json={"dni": "30111222", "name": "Ana Pérez"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 201


async def test_non_admin_cannot_list_users(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_employee(db_session, "empleado1", "pass1234")
    token = await _login(client_no_auth, "empleado1", "pass1234")

    resp = await client_no_auth.get("/users", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 403
