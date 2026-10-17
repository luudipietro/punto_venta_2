from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_route_authorization import _login, _seed_employee


async def _product(client: AsyncClient, name: str, category_id: int | None = None) -> int:
    resp = await client.post(
        "/products",
        json={"name": name, "category_id": category_id, "cost": "10.00", "price": "20.00"},
    )
    return resp.json()["id"]


async def _category_of(client: AsyncClient, product_id: int) -> int | None:
    return (await client.get(f"/products/{product_id}")).json()["category_id"]


async def test_set_category_products_adds_moves_and_removes(client: AsyncClient) -> None:
    ropa = (await client.post("/categories", json={"name": "Ropa"})).json()["id"]
    calzado = (await client.post("/categories", json={"name": "Calzado"})).json()["id"]
    a = await _product(client, "A")
    b = await _product(client, "B", ropa)
    c = await _product(client, "C", calzado)

    resp = await client.put(f"/categories/{ropa}/products", json={"product_ids": [a, c]})

    assert resp.status_code == 204
    assert await _category_of(client, a) == ropa
    assert await _category_of(client, c) == ropa  # moved from calzado
    assert await _category_of(client, b) is None  # dropped from the set


async def test_set_category_products_unknown_ids_return_404(client: AsyncClient) -> None:
    ropa = (await client.post("/categories", json={"name": "Ropa"})).json()["id"]

    assert (
        await client.put("/categories/999/products", json={"product_ids": []})
    ).status_code == 404
    resp = await client.put(f"/categories/{ropa}/products", json={"product_ids": [999]})
    assert resp.status_code == 404


async def test_employee_cannot_set_category_products(
    client_no_auth: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_employee(db_session, "empleado1", "pass1234")
    token = await _login(client_no_auth, "empleado1", "pass1234")

    resp = await client_no_auth.put(
        "/categories/1/products",
        json={"product_ids": []},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403
