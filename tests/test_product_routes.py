from httpx import AsyncClient


async def test_create_and_get_product(client: AsyncClient) -> None:
    category_resp = await client.post("/categories", json={"name": "Ropa"})
    assert category_resp.status_code == 201
    category_id = category_resp.json()["id"]

    brand_resp = await client.post("/brands", json={"name": "Nike"})
    assert brand_resp.status_code == 201
    brand_id = brand_resp.json()["id"]

    create_resp = await client.post(
        "/products",
        json={
            "name": "Remera",
            "category_id": category_id,
            "brand_id": brand_id,
            "cost": "10.00",
            "price": "20.00",
        },
    )
    assert create_resp.status_code == 201
    product = create_resp.json()
    assert product["name"] == "Remera"

    get_resp = await client.get(f"/products/{product['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["price"] == "20.00"


async def test_get_product_not_found(client: AsyncClient) -> None:
    resp = await client.get("/products/999")
    assert resp.status_code == 404


async def test_create_product_without_category_or_brand(client: AsyncClient) -> None:
    create_resp = await client.post(
        "/products",
        json={"name": "Producto suelto", "cost": "10.00", "price": "20.00"},
    )
    assert create_resp.status_code == 201
    product = create_resp.json()
    assert product["category_id"] is None
    assert product["brand_id"] is None


async def test_create_product_with_missing_category_returns_404(client: AsyncClient) -> None:
    brand_resp = await client.post("/brands", json={"name": "Adidas"})
    brand_id = brand_resp.json()["id"]

    resp = await client.post(
        "/products",
        json={
            "name": "Zapatilla",
            "category_id": 999,
            "brand_id": brand_id,
            "cost": "10.00",
            "price": "20.00",
        },
    )
    assert resp.status_code == 404


async def test_delete_product_with_stock_returns_friendly_error(client: AsyncClient) -> None:
    product_resp = await client.post(
        "/products", json={"name": "Con stock", "cost": "10.00", "price": "20.00"}
    )
    product_id = product_resp.json()["id"]
    branch_resp = await client.post("/branches", json={"name": "Central"})
    branch_id = branch_resp.json()["id"]
    await client.post(
        "/stocks",
        json={"product_id": product_id, "branch_id": branch_id, "quantity": 5},
    )

    resp = await client.delete(f"/products/{product_id}")

    assert resp.status_code == 422
    assert "no se puede eliminar" in resp.json()["detail"].lower()
