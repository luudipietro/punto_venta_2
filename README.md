# POS Backend

Backend de punto de venta (FastAPI + SQLAlchemy async + PostgreSQL). Alcance actual: catálogo
(categorías, marcas, colores, talles, sucursales, productos), stock por variante y el flujo de
venta (venta, ítems de venta, pagos). Compras, promociones y cambios/devoluciones quedan para una
siguiente pasada.

## Arquitectura

```
app/
  domain/          entidades de negocio puras (dataclasses)
  infrastructure/  modelos ORM (SQLAlchemy) y sesión de base de datos
  repositories/     interfaz + implementación SQLAlchemy por entidad
  schemas/         DTOs de entrada/salida (Pydantic)
  services/        lógica de negocio, orquesta repositorios
  routes/          routers de FastAPI
  core/            configuración, excepciones de dominio, exception handlers
```

## Requisitos

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Docker (para PostgreSQL en desarrollo)

## Setup

```bash
uv sync
cp .env.example .env
docker compose up -d
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

La API queda disponible en `http://localhost:8000`, con documentación interactiva en
`http://localhost:8000/docs`.

## Cambiar de PostgreSQL a MySQL

El proyecto accede a la base únicamente a través de SQLAlchemy, así que cambiar de motor es
cuestión de configuración, no de código:

1. Instalar el driver async correspondiente (`uv add aiomysql` o `uv add asyncmy`).
2. Cambiar `DATABASE_URL` en `.env` a `mysql+aiomysql://user:password@host:3306/db`.
3. Ajustar `docker-compose.yml` para levantar `mysql` en lugar de `postgres`.

## Tests

```bash
uv run pytest
```

Los tests corren contra SQLite en memoria (no requieren Docker).

## Lint

```bash
uv run ruff check .
uv run ruff format .
```

## Migraciones

```bash
uv run alembic revision --autogenerate -m "descripcion"
uv run alembic upgrade head
```
