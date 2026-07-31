from httpx import AsyncClient


async def _seed_sale(client: AsyncClient) -> tuple[int, int, int]:
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
            "quantity": 5,
        },
    )
    stock_id = stock_resp.json()["id"]
    payment_method_resp = await client.post("/payment-methods", json={"name": "Efectivo"})
    payment_method_id = payment_method_resp.json()["id"]

    sale_resp = await client.post(
        "/sales",
        json={
            "branch_id": branch_id,
            "discount": "0",
            "items": [{"stock_id": stock_id, "quantity": 2, "unit_price": "20.00"}],
            "payments": [
                {
                    "payment_method_id": payment_method_id,
                    "amount_without_surcharge": "40.00",
                    "amount_with_surcharge": "40.00",
                }
            ],
        },
    )
    sale_id = sale_resp.json()["id"]
    return sale_id, stock_id, payment_method_id


async def test_create_and_get_pure_return_exchange(client: AsyncClient) -> None:
    sale_id, stock_id, payment_method_id = await _seed_sale(client)

    create_resp = await client.post(
        "/exchanges",
        json={
            "sale_id": sale_id,
            "returned_items": [{"stock_id": stock_id, "quantity": 1, "unit_price": "20.00"}],
            "new_items": [],
            "payments": [{"payment_method_id": payment_method_id, "amount": "-20.00"}],
        },
    )
    assert create_resp.status_code == 201
    exchange = create_resp.json()
    assert len(exchange["returned_items"]) == 1
    assert exchange["new_items"] == []

    get_resp = await client.get(f"/exchanges/{exchange['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["sale_id"] == sale_id

    stock_resp = await client.get(f"/stocks/{stock_id}")
    assert stock_resp.json()["quantity"] == 4  # 5 - 2 sold + 1 returned


async def test_get_exchange_not_found(client: AsyncClient) -> None:
    resp = await client.get("/exchanges/999")
    assert resp.status_code == 404
