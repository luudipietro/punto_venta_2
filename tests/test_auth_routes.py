from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.branch import Branch
from app.domain.user import UserRole
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.user_repository import SqlAlchemyUserRepository
from app.services.user_service import UserService


async def _seed_user(
    db_session: AsyncSession, username: str, password: str, role: UserRole
) -> None:
    branch_id = None
    if role == UserRole.EMPLEADO:
        branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
        branch_id = branch.id
    service = UserService(
        SqlAlchemyUserRepository(db_session), SqlAlchemyBranchRepository(db_session)
    )
    await service.create(username, password, role, branch_id)
    await db_session.commit()


async def test_login_with_correct_credentials_returns_token(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_user(db_session, "admin", "admin123", UserRole.ADMIN)

    resp = await client_no_auth.post(
        "/auth/login", json={"username": "admin", "password": "admin123"}
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["username"] == "admin"
    assert body["user"]["role"] == "admin"


async def test_login_with_wrong_password_returns_422(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_user(db_session, "admin", "admin123", UserRole.ADMIN)

    resp = await client_no_auth.post("/auth/login", json={"username": "admin", "password": "wrong"})

    assert resp.status_code == 422


async def test_me_without_token_returns_401(client_no_auth: AsyncClient) -> None:
    resp = await client_no_auth.get("/auth/me")

    assert resp.status_code == 401


async def test_me_with_valid_token_returns_current_user(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_user(db_session, "admin", "admin123", UserRole.ADMIN)
    login_resp = await client_no_auth.post(
        "/auth/login", json={"username": "admin", "password": "admin123"}
    )
    token = login_resp.json()["access_token"]

    resp = await client_no_auth.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"
