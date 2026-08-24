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

When a test needs "today" to line up with a `Sale.created_at` (server-set via `func.now()`, so
effectively UTC), read it back off the created row (`sale.created_at.date()`) instead of calling
`date.today()` separately — the local machine's clock and the DB's UTC clock can disagree on which
calendar day it is near midnight, which flaked `test_report_service.py` once.

```bash
npm --prefix frontend install              # install frontend dependencies
npm --prefix frontend run dev              # Vite dev server (http://localhost:5173)
npm --prefix frontend run build            # tsc -b && vite build (production build)
npx --prefix frontend tsc --noEmit -p frontend/tsconfig.app.json  # type-check only
```

The backend must be running (`uv run uvicorn app.main:app --reload`) with Postgres up
(`docker compose up -d`) for the frontend to have anything to talk to — it has no mock/offline
mode. `.claude/launch.json` defines the `frontend` preview config (`npm --prefix frontend run dev`,
port 5173) for tools that drive a browser preview.

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
  (registered in `main.py`) is the only place that maps them to HTTP status codes. It also
  registers a catch-all `Exception` handler — **do not remove this**. Without it, an unhandled
  exception (e.g. a raw `IntegrityError` that slips past a service) propagates past Starlette's
  `ExceptionMiddleware`, which is what `CORSMiddleware` sits inside of; the 500 response
  `ServerErrorMiddleware` generates as a fallback never passes back through `CORSMiddleware`, so it
  arrives at the browser with no `Access-Control-Allow-Origin` header and shows up as a misleading
  CORS error instead of the real 500. This actually happened (`Stock` creation hitting
  `uq_stock_variant`) before `StockService.create` started translating that specific
  `IntegrityError` into a `BusinessRuleViolationError` — the general lesson is: any new place that
  can raise a raw DB/SQLAlchemy exception should translate it into a domain exception, or it'll
  surface as a fake CORS error on the frontend.
- **CORS**: `app/main.py` registers `CORSMiddleware` with `Settings.cors_origins` (`app/core/
  config.py`, defaults to `["http://localhost:5173"]`) — required for the Vite dev server to call
  the API at all. Extend `cors_origins` (via env var) rather than disabling CORS if a new frontend
  origin is added.

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

Fully implemented, following the same per-entity file pattern throughout: Category, Brand, Color
(with `hex_code`), Size, Branch, Product, Stock (with `/increase` and `/decrease`
quantity-adjustment endpoints), PaymentMethod (with `is_cash`), Sale/SaleItem/SalePayment,
Purchase/PurchaseItem, Promotion, Exchange/ExchangeReturnItem/ExchangeNewItem/ExchangePayment, and
Expense. A React/Vite frontend (`frontend/`, see the **Frontend** section below) covers the whole
API. The original domain model is now fully covered.

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
- **Sale preview**: `SaleService.compute_totals` (subtotal/promotion/discount/total math, no
  persistence, no stock touched) is shared by `create_sale` and `POST /sales/preview` — the
  frontend calls `/sales/preview` live as the cart changes so the promotion/total can be shown
  *before* the sale is confirmed, then calls `POST /sales` with the same payload plus `payments`.
- **`Sale.created_at`** is server-set (`server_default=func.now()`, never accepted from the
  client) and is what the daily-balance report groups by; it did not exist before this feature and
  had to be backfilled onto existing rows via the column's DB default (see Database section).
- **Sale cancellation**: a `Sale` is otherwise append-only (see below), but `cancelled_at`
  (`app/domain/sale.py`) is the one exception — `SaleService.cancel_sale` restores each
  `SaleItem`'s stock via `StockService.increase_quantity`, then calls
  `SaleRepository.mark_cancelled` (a narrow UPDATE, not a general `update()` — the repository still
  has no such method). Raises `BusinessRuleViolationError` if already cancelled. A cancelled sale
  stays in `GET /sales`/`GET /sales/{id}` for the record but is excluded from
  `ReportService.daily_cash_balance` entirely (see below) and the frontend hides its "Cambio /
  devolución" and "Cancelar" actions once cancelled.
- **Expense** (`app/domain/expense.py`) is a flat entity — `branch_id`, `payment_method_id`,
  `amount`, `description`, `date` — with full CRUD via the generic `CrudService` pattern (plus FK
  existence checks in `ExpenseService`, same shape as `StockService._ensure_references_exist`).
  Represents money paid out of a branch (e.g. buying cleaning supplies with register cash);
  `payment_method_id` records *what it was paid with*, reusing `PaymentMethod` rather than a
  separate concept.
- **`PaymentMethod.is_cash`**: a boolean added specifically so daily-balance reporting has a
  reliable way to know which payments/expenses are physical cash-register money, instead of
  string-matching on `name` (e.g. `"Efectivo"`). Set it `True` on whichever payment method(s)
  represent the register; it defaults to `False` for everything else (card, transfer, etc.).
- **Daily cash balance report** (`app/services/report_service.py`,
  `GET /branches/{branch_id}/daily-balance`): not a persisted entity — `ReportService` composes
  `Sale`+`SalePayment`+`Expense`+`PaymentMethod` data in memory per branch (acceptable at a single
  POS's data volume) and groups by day into `sales_cash_total` (only payments whose method has
  `is_cash=True`), `sales_total` (all payments, informative only), `expenses_cash_total` (only
  expenses paid with an `is_cash` method), and `balance = sales_cash_total - expenses_cash_total`.
  Cancelled sales are filtered out before aggregating. This is deliberately *cash-only* — a sale
  paid entirely by card contributes to `sales_total` but not to the balance.

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

Two more migrations, also applied: `25abd4b01c30` (`colors.hex_code`, `payment_methods.is_cash`,
`sales.created_at`, and the new `expenses` table, all in one revision — `hex_code`/`is_cash`
needed the same temporary-`server_default`-then-`alter_column`-to-drop-it trick as
`promotion_discount` above, since both are `NOT NULL` columns added onto a table with existing
rows; `created_at` didn't need it because its `server_default=func.now()` is permanent, not
temporary) and `e5d4ba9f63f5` (`sales.cancelled_at`, nullable, no backfill concern).

## Frontend

`frontend/` is a React 19 + Vite + TypeScript SPA (no SSR) that consumes the API above end to end.
Stack: Tailwind CSS v4 (CSS-variable theming) + shadcn/ui (components copied into
`frontend/src/components/ui/`, not an npm dependency — add more with
`npx shadcn@latest add <component>` from `frontend/`), TanStack Query for all server state, Zustand
for the POS cart only, React Router, React Hook Form + Zod where forms need real validation.

```
frontend/src/
  theme/            # brandConfig (logo/name/colors) + ThemeProvider — the one place to
                     # re-skin the app per client; see brand.config.ts
  api/              # one file per entity: typed fetch functions, mirrors the Pydantic schemas
  hooks/            # TanStack Query hooks; createCrudHooks.ts / createCrudApi (api/base.ts)
                     # generate list/get/create/update/remove for the plain catalog entities
  modules/
    catalog/        # SimpleCatalogPage.tsx: generic table+dialog CRUD screen, config-driven
                     # (Field.type now includes 'checkbox', used by is_cash) — Category, Brand,
                     # Size, Branch, PaymentMethod use it as-is; Color and Product got bespoke
                     # pages instead once they needed a color swatch / image thumbnail
    products/       # ProductsPage.tsx — list/grid view toggle, image_url field + thumbnail
    stock/          # StockPage.tsx — +/- adjustments require an AlertDialog confirmation
                     # (deliberately not audited server-side yet, see Known limitations); search
                     # by product name, branch filter, and sortable Producto/Cantidad/Sucursal
                     # column headers, all computed client-side over the already-loaded stock list
    sale/           # the POS: SalePage/ProductPicker/CartPanel/PaymentPanel/cartStore.ts,
                     # SalesHistoryPage.tsx (daily balance, expandable per-day sale list),
                     # SaleDetailPanel.tsx (single-sale detail: cancel action, inline exchange,
                     # a thumbnail + resolved name per line, applied-promotion detail link)
    exchanges/      # ExchangesPage.tsx (pick-a-sale + create, branch column + branch filter
                     # resolved by joining each Exchange's sale_id against useSales()) and
                     # ExchangeForm.tsx (the returns/new-items/payments fields, shared with
                     # SaleDetailPanel so a cambio/devolución can be started either from /cambios
                     # or from a sale's own detail panel without navigating away)
    purchases/      # PurchasesPage.tsx (list + create) and PurchaseDetailPanel.tsx (click a row
                     # to see its PurchaseItems with product image/name, mirrors SaleDetailPanel)
    promotions/     # PromotionsPage.tsx (create/edit, full item replace on save — see Promotion
                     # in Scope above) and PromotionDetail.tsx, a read-only "what's in this promo"
                     # breakdown shared between a "Ver detalle" row action on /promociones and a
                     # link next to "Promoción aplicada" in CartPanel.tsx during a sale
    shared/useStockOptions.ts  # stock-row -> product/variant/image resolver, see gotcha below
  components/       # Layout (sidebar/topbar/theme toggle), PageHeader, ui/ (shadcn)
```

Notable frontend-specific decisions, in case they look surprising:

- **Discount % vs $**: the backend only ever accepts an absolute `discount` amount — there is no
  percentage concept in the API. `CartPanel.tsx` keeps a `%`/`$` toggle and a raw input as
  *local UI state*, and converts to an absolute amount (recomputed against the live subtotal,
  including when the cart itself changes) before it ever reaches `cartStore.discount` or gets sent
  to `/sales/preview`/`/sales`.
- **Cart images/colors**: `useSaleCatalog.ts` and `useStockOptions.ts` both join `Stock` with
  `Product`/`Color`/`Size` client-side (no dedicated "stock with details" backend endpoint) to
  resolve `image_url` and `hex_code` for display in the product picker, cart lines, and stock
  table.
- **`useStockOptions(branchId?)` has two distinct uses — don't default to passing a branch**: pass
  `branchId` when it's a *picker* for choosing stock to add (Purchase items, Exchange new items) —
  filtering to that branch's live stock is exactly what you want there. Call it with **no**
  `branchId` when *displaying* an already-recorded `stock_id` from a historical Sale/Purchase/
  Exchange line (`SaleDetailPanel.tsx`, `PurchaseDetailPanel.tsx`, `ExchangeForm.tsx`'s returned-
  items list). This actually shipped as a bug once: the backend never validates that a `SaleItem`'s
  stock stayed in the sale's branch (unlike `PurchaseService.create_purchase`, which does — see
  above), so once a `Stock` row's `branch_id` drifted from what it was at sale time, the
  branch-filtered lookup silently dropped it and the UI fell back to a bare `Stock #{id}` instead
  of the product's name. A stock row's *current* branch shouldn't be able to erase a *historical*
  record's product name.
- **Sale detail / cancel / exchange all reuse `useSale(id)`** (`GET /sales/{id}`, includes items +
  payments) rather than the list endpoint, which only returns summary fields.
- Product images and color swatches degrade gracefully: a broken/empty `image_url` hides the
  `<img>` (`onError` sets `visibility: hidden`) rather than showing a broken-image icon; a color
  with the default `#000000` `hex_code` (never customized) just renders a black swatch, not an
  error.
- **Widening a `DialogContent` needs `sm:max-w-*`, not bare `max-w-*`**: the shadcn base
  (`components/ui/dialog.tsx`) ships `sm:max-w-sm` on every dialog. Tailwind emits responsive
  variants after unprefixed utilities in the generated stylesheet, so at viewport widths ≥640px
  `sm:max-w-sm` wins the cascade over a plain `max-w-2xl` passed in `className` — the dialog
  silently stays narrow. Every "make this dialog bigger" override in this codebase
  (`SalesHistoryPage.tsx`, `PurchasesPage.tsx`, `PromotionsPage.tsx`, `ExchangesPage.tsx`) uses
  `sm:max-w-2xl` for this reason; keep doing that instead of a bare `max-w-*`.

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
- **No audit trail for manual stock +/-**: `StockPage.tsx` asks for confirmation before applying a
  manual increase/decrease (to avoid stray clicks), but nothing records who/when/why on the
  backend — `StockService.increase_quantity`/`decrease_quantity` just mutate `quantity`. Explicitly
  deferred until there's a login/user system to attribute the change to; revisit then rather than
  bolting on an anonymous audit log now.

None of these are scheduled — flag them to the user before picking one up, since each implies a
design decision (e.g. how usage caps should be scoped, whether category combos should be
per-product) similar to the ones resolved for the Promotion redesign above.
