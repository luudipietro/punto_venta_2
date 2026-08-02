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
each `SaleItem`'s `Stock` -> `Product` into per-product cart totals (`cart_quantities`,
`cart_categories`, `cart_unit_prices`, `cart_item_index`), asks
`PromotionService.select_winning_applications` (see below) which promotions win, distributes each
winning `PromotionApplication` onto the matching `SaleItem`s (setting `SaleItem.promotion_id`) and
sums `promotion_discount`, then validates the payments total matches
`subtotal - discount - promotion_discount`, checks/decrements stock through a `StockService`
instance built on the same session, then persists the Sale, SaleItems and SalePayments — all
before the request's `get_db` commits. When creating a `SaleItem`/`SalePayment` via its
repository, remember to copy the returned `.id` back onto the object you keep a reference to (the
repository returns a *new* domain instance; it does not mutate the one you passed in). `Purchase`
(`app/services/purchase_service.py`) and `Exchange` (`app/services/exchange_service.py`) follow
the same parent-then-children persistence shape as Sale, and their repositories are append-only
(`list_all`/`get_by_id`/`create` only — no update/delete), matching the "a Sale is never edited
after the fact" convention in `sale_repository.py`. `PurchaseService.create_purchase` also
validates upfront that every item's `Stock.branch_id` matches the purchase's own `branch_id`
(`BusinessRuleViolationError` otherwise) — stock is always identified by `stock_id`, not
`branch_id`, so nothing else in the codebase catches a mismatched branch for you.

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
- **Stock** (`app/domain/stock.py`) has optional `color_id`/`size_id` — a product with no color or
  size variety can have a `Stock` row with both set to `None`. The `uq_stock_variant` unique
  constraint on `(product_id, color_id, size_id, branch_id)` does not dedupe rows where
  color/size are both `NULL` (Postgres treats `NULL <> NULL`), which is accepted as-is.
- **Promotion** (`app/domain/promotion.py` + `app/domain/promotion_item.py`) is a parent/children
  entity, not a flat row: `Promotion` only holds `name`/`start_date`/`end_date`/`active`, and every
  condition/effect lives on one or more `PromotionItem` lines (`promotion_items` table), each
  targeting exactly one of `product_id`/`category_id` (enforced in `PromotionService._validate_items`,
  `BusinessRuleViolationError`, not the Pydantic schema) with its own `DiscountType.PERCENTAGE` /
  `FIXED_AMOUNT`, `discount_value`, `min_quantity` (trigger threshold — how many of the target must
  be in the cart) and `max_quantity` (discount cap — `None` means discount the full matched cart
  quantity). A promotion with one line is a simple "X% off product/category" discount; a promotion
  with 2+ lines is a combo/gift (e.g. a "buy 1 shirt, get 1 pair of socks free" gift is a 2-line
  promotion: a 0%-discount shirt line and a 100%-discount, `max_quantity=1` socks line, so extra
  pairs of socks in the cart stay full price). `PromotionService.create`/`update` persist the
  parent then each child (copying `.id` back), same pattern as `SaleService`/`PurchaseService`;
  `update` fully replaces a promotion's items (`delete_by_promotion` + recreate) rather than
  patching individual lines.

  It's wired into `SaleService.create_sale` via `PromotionService.select_winning_applications`,
  which replaced the old single-promotion `find_applicable`: it finds every active promotion whose
  lines are fully satisfied by the cart (a `category_id` line matches the first cart product in
  that category, in cart order, with enough remaining quantity), clusters competing promotions by
  shared matched products (union-find), and within each cluster picks the promotion with the
  **greatest total discount amount** (not percentage — ties broken by lowest `promotion.id`).
  Promotions in disjoint clusters (no shared product) all win and stack simultaneously. Each
  winning line's discount is written onto the covering `SaleItem`(s)' `promotion_id`; items not
  covered by any winner keep `promotion_id = None`. The resulting `Sale.promotion_discount` is
  server-computed only (never accepted from `SaleCreate`) and is subtracted from the total
  alongside the manual `discount` (which can now carry an optional `discount_reason` string, e.g.
  "cliente frecuente" — also server-trusted, just persisted as-is).
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

Two more migrations, also applied: `eb9386a495b1` (nullable `stocks.color_id`/`size_id`, new
nullable `sales.discount_reason` and `sale_items.promotion_id` columns — no backfill needed since
all three are nullable) and `5b39eed395fb` (new `promotion_items` table; drops
`product_id`/`category_id`/`discount_type`/`discount_value` from `promotions` in favor of
`promotion_items` rows — any previously-created promotions lost that data, accepted since this is
a local dev database). Note: the autogenerated `promotion_items.discount_type` column reuses the
`discounttype` Postgres enum already created for the old `promotions.discount_type` column, so the
generated `sa.Enum(...)` / `postgresql.ENUM(...)` calls in that migration need `create_type=False`
(both in `upgrade()`'s `create_table` and `downgrade()`'s `add_column`) — otherwise Postgres raises
`DuplicateObjectError: type "discounttype" already exists`. Watch for this whenever a migration
reuses an existing enum type name in a new column.

## Known limitations / possible next steps

Raised during manual Postman/pgAdmin testing of the flows above; deliberately deferred, not bugs:

- **No promotion usage cap**: a `PromotionItem` has no "max N uses" or "once per customer" concept
  — a combo can be applied to every qualifying sale indefinitely while `active`/date-range allow it.
- **No quantity-tier promotions** ("3x2", "2nd unit 50% off"): `min_quantity`/`max_quantity` express
  a fixed trigger/cap per line, not a repeating multiplier — buying 6 of a "3x2" product today just
  triggers the line once (if it's the cluster winner), it doesn't apply twice.
- **No stock transfer between branches**: `StockService` only has `increase_quantity`/
  `decrease_quantity`; moving stock from one branch's row to another's is two manual calls today,
  with no atomic "transfer" operation or audit trail of the move.
- **Exchange doesn't touch promotions**: `ExchangeService.create_exchange` computes return/new-item
  amounts from `unit_price * quantity` only (`app/services/exchange_service.py`) — it doesn't look
  at the original `SaleItem.promotion_id` or reverse/prorate a `Sale.promotion_discount` on a
  return. Returning an item that was sold at a promotional price currently refunds it at full
  `unit_price` unless the caller passes a lower price manually.
- **Purchase doesn't update a reference cost**: `PurchaseService.create_purchase` records
  `unit_cost` per `PurchaseItem` but never writes back to `Product` (there's no "current cost"
  field on `Product` to update) — margin reporting would need to derive cost from purchase history
  itself, there's no shortcut field.
- **Category-line promotions pick one product only**: a `PromotionItem` with `category_id` set
  matches the *first* cart product in that category (in cart-item order) — if a category-wide combo
  line should apply per-product across every matching item in the cart instead of just one, that's
  a deliberate simplification from the original design discussion, not yet revisited.
- **No pessimistic locking on stock**: concurrent sales decrementing the same `Stock` row rely on
  the DB transaction alone; there's no explicit `SELECT ... FOR UPDATE` or optimistic version column,
  so a race between two simultaneous sales against the same low-stock row is possible in principle.

None of these are scheduled — flag them to the user before picking one up, since each implies a
design decision (e.g. how usage caps should be scoped, whether category combos should be
per-product) similar to the ones resolved for the Promotion redesign above.
