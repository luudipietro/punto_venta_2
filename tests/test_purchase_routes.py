from httpx import AsyncClient


async def _seed_stock(client: AsyncClient) -> int:
    category_resp = await client.post("/categories", json={"name": "Ropa"})
    category_id = category_resp.json()["id"]
    brand_resp = await client.post("/brands", json={"name": "Nike"})
    brand_id = brand_resp.json()["id"]
    color_resp = await client.post("/colors", json={"name": "Negro"})
    color_id = color_resp.json()["id"]
    size_resp = await client.post("/sizes", json={"label": "M"})
    size_id = size_resp.json()["id"]
    branch_resp = await client.post("/branches", json={"name": "Central"})
    branch_id = branch_resp.json()["id"]
    product_resp = await client.post(
        "/products",
        json={
            "name": "Remera",
            "category_id": category_id,
            "brand_id": brand_id,
            "cost": "10.00",
            "price": "20.00",
        },
    )
    product_id = product_resp.json()["id"]
    stock_resp = await client.post(
        "/stocks",
        json={
            "product_id": product_id,
            "color_id": color_id,
            "size_id": size_id,
            "branch_id": branch_id,
            "quantity": 0,
        },
    )
    return stock_resp.json()["id"]


async def test_create_and_get_purchase(client: AsyncClient) -> None:
    stock_id = await _seed_stock(client)
    branch_resp = await client.get("/branches")
    branch_id = branch_resp.json()[0]["id"]

    create_resp = await client.post(
        "/purchases",
        json={
            "branch_id": branch_id,
            "supplier_name": "Distribuidora Sur",
            "items": [{"stock_id": stock_id, "quantity": 4, "unit_cost": "10.00"}],
        },
    )
    assert create_resp.status_code == 201
    purchase = create_resp.json()
    assert purchase["total"] == "40.00"
    assert purchase["items"][0]["quantity"] == 4

    get_resp = await client.get(f"/purchases/{purchase['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["supplier_name"] == "Distribuidora Sur"

    stock_resp = await client.get(f"/stocks/{stock_id}")
    assert stock_resp.json()["quantity"] == 4


async def test_get_purchase_not_found(client: AsyncClient) -> None:
    resp = await client.get("/purchases/999")
    assert resp.status_code == 404
