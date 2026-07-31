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
