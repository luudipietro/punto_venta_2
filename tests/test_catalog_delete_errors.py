from httpx import AsyncClient


async def test_delete_branch_with_stock_returns_friendly_error(client: AsyncClient) -> None:
    branch_resp = await client.post("/branches", json={"name": "Central"})
    branch_id = branch_resp.json()["id"]
    product_resp = await client.post(
        "/products", json={"name": "Remera", "cost": "10.00", "price": "20.00"}
    )
    product_id = product_resp.json()["id"]
    await client.post(
        "/stocks", json={"product_id": product_id, "branch_id": branch_id, "quantity": 5}
    )

    resp = await client.delete(f"/branches/{branch_id}")

    assert resp.status_code == 422
    assert "no se puede eliminar" in resp.json()["detail"].lower()


async def test_delete_category_with_product_returns_friendly_error(client: AsyncClient) -> None:
    category_resp = await client.post("/categories", json={"name": "Ropa"})
    category_id = category_resp.json()["id"]
    await client.post(
        "/products",
        json={"name": "Remera", "category_id": category_id, "cost": "10.00", "price": "20.00"},
    )

    resp = await client.delete(f"/categories/{category_id}")

    assert resp.status_code == 422
    assert "no se puede eliminar" in resp.json()["detail"].lower()


async def test_delete_brand_with_product_returns_friendly_error(client: AsyncClient) -> None:
    brand_resp = await client.post("/brands", json={"name": "Nike"})
    brand_id = brand_resp.json()["id"]
    await client.post(
        "/products",
        json={"name": "Remera", "brand_id": brand_id, "cost": "10.00", "price": "20.00"},
    )

    resp = await client.delete(f"/brands/{brand_id}")

    assert resp.status_code == 422
    assert "no se puede eliminar" in resp.json()["detail"].lower()


async def test_delete_color_with_stock_returns_friendly_error(client: AsyncClient) -> None:
    color_resp = await client.post("/colors", json={"name": "Rojo", "hex_code": "#FF0000"})
    color_id = color_resp.json()["id"]
    branch_resp = await client.post("/branches", json={"name": "Central"})
    branch_id = branch_resp.json()["id"]
    product_resp = await client.post(
        "/products", json={"name": "Remera", "cost": "10.00", "price": "20.00"}
    )
    product_id = product_resp.json()["id"]
    await client.post(
        "/stocks",
        json={
            "product_id": product_id,
            "branch_id": branch_id,
            "color_id": color_id,
            "quantity": 5,
        },
    )

    resp = await client.delete(f"/colors/{color_id}")

    assert resp.status_code == 422
    assert "no se puede eliminar" in resp.json()["detail"].lower()


async def test_delete_size_with_stock_returns_friendly_error(client: AsyncClient) -> None:
    size_resp = await client.post("/sizes", json={"label": "M"})
    size_id = size_resp.json()["id"]
    branch_resp = await client.post("/branches", json={"name": "Central"})
    branch_id = branch_resp.json()["id"]
    product_resp = await client.post(
        "/products", json={"name": "Remera", "cost": "10.00", "price": "20.00"}
    )
    product_id = product_resp.json()["id"]
    await client.post(
        "/stocks",
        json={"product_id": product_id, "branch_id": branch_id, "size_id": size_id, "quantity": 5},
    )

    resp = await client.delete(f"/sizes/{size_id}")

    assert resp.status_code == 422
    assert "no se puede eliminar" in resp.json()["detail"].lower()


async def test_delete_payment_method_with_expense_returns_friendly_error(
    client: AsyncClient,
) -> None:
    payment_method_resp = await client.post(
        "/payment-methods", json={"name": "Efectivo", "is_cash": True}
    )
    payment_method_id = payment_method_resp.json()["id"]
    branch_resp = await client.post("/branches", json={"name": "Central"})
    branch_id = branch_resp.json()["id"]
    await client.post(
        "/expenses",
        json={
            "branch_id": branch_id,
            "payment_method_id": payment_method_id,
            "amount": "10.00",
            "description": "Insumos",
            "date": "2026-01-01",
        },
    )

    resp = await client.delete(f"/payment-methods/{payment_method_id}")

    assert resp.status_code == 422
    assert "no se puede eliminar" in resp.json()["detail"].lower()
