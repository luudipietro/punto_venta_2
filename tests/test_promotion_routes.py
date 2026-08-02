from httpx import AsyncClient


async def _seed_product(client: AsyncClient) -> tuple[int, int]:
    category_resp = await client.post("/categories", json={"name": "Ropa"})
    category_id = category_resp.json()["id"]
    brand_resp = await client.post("/brands", json={"name": "Nike"})
    brand_id = brand_resp.json()["id"]
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
    product = product_resp.json()
    return product["id"], category_id


async def test_create_promotion_targeting_product_succeeds(client: AsyncClient) -> None:
    product_id, _ = await _seed_product(client)

    resp = await client.post(
        "/promotions",
        json={
            "name": "10% Remeras",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "items": [
                {
                    "product_id": product_id,
                    "discount_type": "percentage",
                    "discount_value": "10",
                }
            ],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["product_id"] == product_id


async def test_create_promotion_with_both_product_and_category_returns_422(
    client: AsyncClient,
) -> None:
    product_id, category_id = await _seed_product(client)

    resp = await client.post(
        "/promotions",
        json={
            "name": "Invalida",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "items": [
                {
                    "product_id": product_id,
                    "category_id": category_id,
                    "discount_type": "percentage",
                    "discount_value": "10",
                }
            ],
        },
    )
    assert resp.status_code == 422


async def test_create_promotion_with_neither_target_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/promotions",
        json={
            "name": "Invalida",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "items": [
                {
                    "discount_type": "fixed_amount",
                    "discount_value": "5",
                }
            ],
        },
    )
    assert resp.status_code == 422


async def test_create_promotion_with_no_items_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/promotions",
        json={
            "name": "Vacia",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "items": [],
        },
    )
    assert resp.status_code == 422


async def test_create_promotion_with_unknown_product_returns_404(client: AsyncClient) -> None:
    resp = await client.post(
        "/promotions",
        json={
            "name": "Fantasma",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "items": [
                {
                    "product_id": 999,
                    "discount_type": "percentage",
                    "discount_value": "10",
                }
            ],
        },
    )
    assert resp.status_code == 404


async def test_create_promotion_combo_with_multiple_items_succeeds(client: AsyncClient) -> None:
    product_id, category_id = await _seed_product(client)
    other_product_resp = await client.post(
        "/products",
        json={
            "name": "Short",
            "category_id": category_id,
            "brand_id": (await client.post("/brands", json={"name": "Adidas"})).json()["id"],
            "cost": "15.00",
            "price": "30.00",
        },
    )
    other_product_id = other_product_resp.json()["id"]

    resp = await client.post(
        "/promotions",
        json={
            "name": "15% Short+Remera",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "items": [
                {
                    "product_id": product_id,
                    "discount_type": "percentage",
                    "discount_value": "15",
                },
                {
                    "product_id": other_product_id,
                    "discount_type": "percentage",
                    "discount_value": "15",
                },
            ],
        },
    )
    assert resp.status_code == 201
    assert len(resp.json()["items"]) == 2
