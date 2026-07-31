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
            "discount_type": "percentage",
            "discount_value": "10",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "product_id": product_id,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["product_id"] == product_id


async def test_create_promotion_with_both_product_and_category_returns_422(
    client: AsyncClient,
) -> None:
    product_id, category_id = await _seed_product(client)

    resp = await client.post(
        "/promotions",
        json={
            "name": "Invalida",
            "discount_type": "percentage",
            "discount_value": "10",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "product_id": product_id,
            "category_id": category_id,
        },
    )
    assert resp.status_code == 422


async def test_create_promotion_with_neither_target_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/promotions",
        json={
            "name": "Invalida",
            "discount_type": "fixed_amount",
            "discount_value": "5",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        },
    )
    assert resp.status_code == 422


async def test_create_promotion_with_unknown_product_returns_404(client: AsyncClient) -> None:
    resp = await client.post(
        "/promotions",
        json={
            "name": "Fantasma",
            "discount_type": "percentage",
            "discount_value": "10",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "product_id": 999,
        },
    )
    assert resp.status_code == 404
