from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.branch import Branch
from app.domain.user import UserRole
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.user_repository import SqlAlchemyUserRepository
from app.services.user_service import UserService


async def test_get_brand_settings_before_any_update_returns_default(client: AsyncClient) -> None:
    resp = await client.get("/brand-settings")

    assert resp.status_code == 200
    body = resp.json()
    assert body["company_name"] == "Punto de Venta"
    assert body["logo_url"] == "/brand/logo.svg"


async def test_get_brand_settings_is_public(client_no_auth: AsyncClient) -> None:
    """The login page renders the brand logo before anyone is authenticated."""
    resp = await client_no_auth.get("/brand-settings")

    assert resp.status_code == 200


async def test_update_brand_settings_as_admin_persists(client: AsyncClient) -> None:
    resp = await client.put(
        "/brand-settings",
        json={"company_name": "Mi Tienda", "logo_url": "/media/products/logo.png"},
    )

    assert resp.status_code == 200
    assert resp.json()["company_name"] == "Mi Tienda"

    follow_up = await client.get("/brand-settings")
    assert follow_up.json()["company_name"] == "Mi Tienda"
    assert follow_up.json()["logo_url"] == "/media/products/logo.png"


async def test_update_brand_settings_as_non_admin_returns_403(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    service = UserService(
        SqlAlchemyUserRepository(db_session), SqlAlchemyBranchRepository(db_session)
    )
    await service.create("empleado1", "pass1234", UserRole.EMPLEADO, branch.id)
    await db_session.commit()
    login_resp = await client_no_auth.post(
        "/auth/login", json={"username": "empleado1", "password": "pass1234"}
    )
    token = login_resp.json()["access_token"]

    resp = await client_no_auth.put(
        "/brand-settings",
        json={"company_name": "Mi Tienda", "logo_url": "/media/products/logo.png"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403
