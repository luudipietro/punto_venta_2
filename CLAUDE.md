# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
uv sync                                    # install dependencies
docker compose up -d                       # start local Postgres (see .env.example / .env)
uv run alembic upgrade head                # apply migrations
uv run alembic revision --autogenerate -m "description"   # generate a migration after model changes
uv run uvicorn app.main:app --reload       # run the API (docs at /docs)

uv run pytest                              # run all tests (SQLite in-memory, no Docker needed)
uv run pytest tests/test_sale_service.py::test_create_sale_decrements_stock  # single test

uv run ruff check .                        # lint
uv run ruff check --fix .
uv run ruff format .                       # format
```

`alembic/versions/` is excluded from ruff — it's generated code and follows Alembic's own template
style, not this project's conventions.

## Architecture

Layered/hexagonal design: the domain is plain Python, persistence is SQLAlchemy, and each layer
only talks to the one directly below it.

```
app/domain/          # plain dataclasses (Product, Sale, Stock, ...) — no ORM, no Pydantic
app/infrastructure/db/
  base.py            # DeclarativeBase
  session.py         # async engine/session, get_db dependency
  models/            # SQLAlchemy mapped classes, one per entity, mirror the domain 1:1
app/repositories/     # one file per entity: an ABC interface + a SqlAlchemy* implementation
app/schemas/          # Pydantic Create/Update/Read DTOs — the only layer that knows about the API
app/services/          # business logic, orchestrates repositories
app/routes/            # FastAPI routers, one per entity, aggregated in api_router.py
app/core/               # Settings, domain exceptions, exception -> HTTP handlers
```

Key conventions to follow when adding an entity:

- **Domain entities are dataclasses** with `id: int | None = None` last (unset until persisted).
  They never import SQLAlchemy or Pydantic.
- **Repositories** (`app/repositories/<entity>_repository.py`) define an ABC plus a
  `SqlAlchemy<Entity>Repository` implementation in the same file, converting between the ORM model
  and the domain dataclass via a `_to_domain` staticmethod. Simple ones subclass the generic
  `SqlAlchemyRepository[ModelT]` in `base_repository.py` for the `_get_model`/`_list_models`/
  `_delete_model` helpers.
- **Services** for plain catalog entities (Category, Brand, Color, Size, Branch, PaymentMethod)
  subclass the generic `CrudService[DomainT]` in `base_service.py`, which handles the
  not-found-raises-`EntityNotFoundError` logic. Entities with real invariants (Product validating
  its category/brand FK, Stock validating its product/color/size/branch FKs, Sale) override
  `create`/`update` or skip the base class entirely.
- **Dependency wiring** lives at the bottom of each service module as a `get_<entity>_service`
  function (`Depends(get_db)` in, service instance out) — not in a centralized DI file.
- **Unit of work**: `get_db` (in `infrastructure/db/session.py`) yields one `AsyncSession` per
  request and commits on success / rolls back on any exception. Repositories only `flush()`, never
  `commit()`, so multi-repository operations (e.g. creating a Sale + its SaleItems + SalePayments
  while decrementing Stock) stay atomic as long as they share the same session — which they do,
  because every `get_<entity>_service` factory builds its repositories from the same injected
  session.
- **Domain errors, not HTTP**: services raise `EntityNotFoundError` / `InsufficientStockError` /
  `BusinessRuleViolationError` from `app/core/exceptions.py`; `app/core/exception_handlers.py`
  (registered in `main.py`) is the only place that maps them to HTTP status codes.

`SaleService` (`app/services/sale_service.py`) is the most complex flow: `create_sale` resolves
each `SaleItem`'s `Stock` -> `Product` to find an applicable `Promotion` (see below), computes
`promotion_discount`, then validates the payments total matches
`subtotal - discount - promotion_discount`, checks/decrements stock through a `StockService`
instance built on the same session, then persists the Sale, SaleItems and SalePayments — all
before the request's `get_db` commits. When creating a `SaleItem`/`SalePayment` via its
repository, remember to copy the returned `.id` back onto the object you keep a reference to (the
repository returns a *new* domain instance; it does not mutate the one you passed in). `Purchase`
(`app/services/purchase_service.py`) and `Exchange` (`app/services/exchange_service.py`) follow
the same parent-then-children persistence shape as Sale, and their repositories are append-only
(`list_all`/`get_by_id`/`create` only — no update/delete), matching the "a Sale is never edited
after the fact" convention in `sale_repository.py`.

## Scope

Fully implemented, following the same per-entity file pattern throughout: Category, Brand, Color,
Size, Branch, Product, Stock (with `/increase` and `/decrease` quantity-adjustment endpoints),
PaymentMethod, Sale/SaleItem/SalePayment, Purchase/PurchaseItem, Promotion, and
Exchange/ExchangeReturnItem/ExchangeNewItem/ExchangePayment. The original domain model is now
fully covered.

- **Purchase** mirrors Sale but increases stock instead of decreasing it (`PurchaseService.
  create_purchase` calls `StockService.increase_quantity` per item). `supplier_name` is a
  free-text field — there is no separate Supplier entity. No PurchasePayment; purchases aren't
  split by payment method.
- **Promotion** (`app/domain/promotion.py`) is a catalog entity with `DiscountType.PERCENTAGE` /
  `FIXED_AMOUNT` that must target exactly one of `product_id` or `category_id` — enforced in
  `PromotionService.create`/`update` (`BusinessRuleViolationError`), not the Pydantic schema. It's
  wired into `SaleService.create_sale`: `PromotionService.find_applicable` picks a product-specific
  promotion over a category-wide one when both match; the resulting `Sale.promotion_discount` is
  server-computed only (never accepted from `SaleCreate`) and is subtracted from the total
  alongside the manual `discount`. Overlapping promotions on the same exact target are allowed —
  `find_applicable` just returns the first match; there's no uniqueness constraint.
- **Exchange/Return** is one entity covering both flows: `Exchange` + `ExchangeReturnItem`
  (restocked) + `ExchangeNewItem` (destocked; empty list = a pure return) + `ExchangePayment`
  (signed `amount` — positive means the customer pays more, negative means a refund).
  `ExchangeService.create_exchange` validates that returned items were actually part of the
  original Sale and don't exceed the quantity sold. **Known, deliberately deferred limitation**:
  it checks against the *original* `SaleItem` quantity only — quantities already returned via a
  prior Exchange against the same Sale are not subtracted, so the same units could in principle be
  returned twice across separate Exchange records. Revisit with an aggregate query (or a counter)
  if this becomes a real risk; it was left out to avoid that complexity/concurrency concern for now.

Domain names are English translations of the original (Spanish) domain model — e.g. `Sucursal` ->
`Branch`, `Venta` -> `Sale`, `Talle` -> `Size`, `Compra` -> `Purchase`, `Promoción` -> `Promotion`,
`Cambio`/`Devolución` -> `Exchange`. There is no separate translation layer; the English names are
canonical.

## Database

PostgreSQL via `asyncpg`, but all access goes through SQLAlchemy — no raw SQL, no engine-specific
types outside migrations. `DATABASE_URL` (in `.env`, see `.env.example`) is the only thing that
changes to point at a different engine (e.g. `mysql+aiomysql://...`); no application code should
need to change. Alembic (`alembic/env.py`) imports every model module explicitly so
`Base.metadata` is fully populated before autogenerate runs — new model files must be added to
that import list (and to `tests/conftest.py`, which does the same for the in-memory test schema).

The Purchase, Promotion, and Exchange/Return tables (and `sales.promotion_discount`) are covered
by a single autogenerated migration, `b817faa24431_add_purchase_and_purchase_items_tables.py`,
applied to the local Postgres instance. Note: the autogenerated `promotion_discount` column had to
be patched with a temporary `server_default='0'` (removed right after via `alter_column`) so the
`NOT NULL` add-column step wouldn't fail against existing `sales` rows — always review autogenerated
migrations for this kind of issue (new NOT NULL column + existing rows) before applying.
