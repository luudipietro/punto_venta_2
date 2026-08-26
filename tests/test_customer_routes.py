from httpx import AsyncClient


async def test_create_and_get_customer(client: AsyncClient) -> None:
    create_resp = await client.post("/customers", json={"dni": "30111222", "name": "Ana Pérez"})
    assert create_resp.status_code == 201
    customer = create_resp.json()
    assert customer["dni"] == "30111222"
    assert customer["name"] == "Ana Pérez"

    get_resp = await client.get(f"/customers/{customer['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Ana Pérez"


async def test_get_customer_not_found(client: AsyncClient) -> None:
    resp = await client.get("/customers/999")
    assert resp.status_code == 404


async def test_create_customer_with_duplicate_dni_returns_error(client: AsyncClient) -> None:
    await client.post("/customers", json={"dni": "30111333", "name": "Juan Gómez"})

    resp = await client.post("/customers", json={"dni": "30111333", "name": "Otro Nombre"})
    assert resp.status_code == 422


async def test_search_customers_by_dni_or_name(client: AsyncClient) -> None:
    await client.post("/customers", json={"dni": "40222111", "name": "Laura Díaz"})
    await client.post("/customers", json={"dni": "40222222", "name": "Marcos Ruiz"})

    by_dni = await client.get("/customers", params={"q": "40222111"})
    assert by_dni.status_code == 200
    assert [c["name"] for c in by_dni.json()] == ["Laura Díaz"]

    by_name = await client.get("/customers", params={"q": "ruiz"})
    assert by_name.status_code == 200
    assert [c["name"] for c in by_name.json()] == ["Marcos Ruiz"]


async def test_update_and_delete_customer(client: AsyncClient) -> None:
    create_resp = await client.post("/customers", json={"dni": "50333444", "name": "Nombre Viejo"})
    customer_id = create_resp.json()["id"]

    update_resp = await client.put(
        f"/customers/{customer_id}", json={"dni": "50333444", "name": "Nombre Nuevo"}
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Nombre Nuevo"

    delete_resp = await client.delete(f"/customers/{customer_id}")
    assert delete_resp.status_code == 204
    assert (await client.get(f"/customers/{customer_id}")).status_code == 404


async def test_cannot_change_dni_after_creation(client: AsyncClient) -> None:
    create_resp = await client.post("/customers", json={"dni": "60444555", "name": "Alguien"})
    customer_id = create_resp.json()["id"]

    resp = await client.put(
        f"/customers/{customer_id}", json={"dni": "60444556", "name": "Alguien"}
    )
    assert resp.status_code == 422
    assert "DNI" in resp.json()["detail"]

    unchanged = await client.get(f"/customers/{customer_id}")
    assert unchanged.json()["dni"] == "60444555"


async def test_create_customer_with_email_and_phone(client: AsyncClient) -> None:
    resp = await client.post(
        "/customers",
        json={
            "dni": "70555666",
            "name": "Con Contacto",
            "email": "cliente@example.com",
            "phone": "1122334455",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "cliente@example.com"
    assert body["phone"] == "1122334455"
