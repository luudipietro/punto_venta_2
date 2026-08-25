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
(with `hex_code`), Size, Branch, Product/ProductImage, Stock (with `/increase` and `/decrease`
quantity-adjustment endpoints), PaymentMethod (with `is_cash`/`surcharge_percentage`), Customer
(with `dni`/`name`), Sale/SaleItem/SalePayment, Purchase/PurchaseItem, Promotion,
Exchange/ExchangeReturnItem/ExchangeNewItem/ExchangePayment, and Expense. A React/Vite frontend
(`frontend/`, see the **Frontend** section below) covers the whole API. The original domain model
is now fully covered.

- **All API error messages are in Spanish**: `app/core/exceptions.py` translates domain exceptions
  via a small `_ENTITY_NAMES_ES` lookup (`Product` → "producto", `Stock` → "stock", etc.) baked into
  `EntityNotFoundError.__init__`'s message; `InsufficientStockError` is similarly Spanish. FastAPI's
  own `RequestValidationError` (422s from Pydantic field validation, not from a raised domain
  exception) is intercepted by a new `validation_error_handler` in
  `app/core/exception_handlers.py`, which rewrites each error's `msg` to a generic Spanish
  `"{field}: Dato inválido o faltante"` rather than passing through Pydantic's English message
  verbatim — this is a blunt catch-all (it doesn't localize *why* a field is invalid, just that it
  is), not a full i18n system. The catch-all `Exception` handler's fallback message is also Spanish
  now (`"Error interno del servidor"`). New domain exceptions or new entities added to
  `_ENTITY_NAMES_ES` should follow this same pattern rather than leaking an English message to the
  frontend.
- **Deleting a referenced row now fails with a friendly message instead of a fake CORS error**:
  `ProductService.delete`, `StockService.delete`, and `CustomerService.delete` each override the
  base `CrudService.delete` to catch `IntegrityError` (from a still-referencing FK — e.g. a Product
  with stock, or a Stock with sales/purchases/exchanges) and re-raise it as
  `BusinessRuleViolationError` with a specific Spanish message, same pattern `StockService.create`
  already used for the `uq_stock_variant` conflict (see Stock below). Before this, deleting a
  referenced row surfaced as an unhandled `IntegrityError` → generic 500 → (per the CORS note above)
  a misleading "CORS header missing" error in the browser console instead of a real error message.
  `ProductService`/`CustomerService`'s other FK edges (e.g. a Product with `ProductImage`s, a
  Customer with Sales) aren't covered by this yet — see Known limitations.
- **Dates render as dd/mm/yyyy** everywhere in the frontend via `formatDate`/`formatDateTime` in
  `frontend/src/lib/format.ts` (an `Intl.DateTimeFormat('es-AR', ...)` instance) — added because the
  default `toLocaleDateString()`/raw-ISO rendering used inconsistently across pages read as
  yyyy/mm/dd-ish or locale-dependent. `formatDate` expects a bare `YYYY-MM-DD` (appends `T12:00:00`
  before parsing, to dodge UTC-midnight rolling back a day in negative-UTC-offset browsers);
  `formatDateTime` expects a full ISO timestamp. Prefer these over ad hoc `new Date(...).
  toLocaleString()` calls in new code.
- **Product** (`app/domain/product.py`) has `category_id`/`brand_id` as **optional** (`int |
  None`) — a product can be created without either, unlike every other FK on the entity.
  `ProductService._ensure_references_exist` only validates the FK when it's not `None` (same
  conditional-check shape as `StockService._ensure_references_exist` for `color_id`/`size_id`).
  `Product.image_url` remains the single "cover" image shown everywhere (stock table, cart,
  sale/purchase/exchange history) — a separate `ProductImage` entity (`app/domain/product_image.py`,
  table `product_images`, endpoints nested under `/products/{id}/images`) holds an *additional*
  gallery of photos for a future e-commerce frontend, managed by `ProductImageService`
  (existence-checks the product, not a generic `CrudService` since every operation needs the owning
  `product_id`, not a bare entity id). Uploading a file to get a URL (`POST /uploads/images`,
  `app/routes/upload_route.py`, saves under `Settings.media_root` and serves it back via a
  `StaticFiles` mount at `Settings.media_url` in `app/main.py`) is a separate step from attaching
  that URL to a product's cover (`PUT /products/{id}`) or gallery (`POST /products/{id}/images`) —
  the upload endpoint doesn't know or care which entity the image ends up on.
- **Purchase** mirrors Sale but increases stock instead of decreasing it (`PurchaseService.
  create_purchase` calls `StockService.increase_quantity` per item, and also overwrites
  `Product.cost` with each item's `unit_cost` — "last purchase cost wins" if a purchase has
  multiple items for the same product, no weighted average). `supplier_name` is a free-text field —
  there is no separate Supplier entity. A `Purchase` optionally carries `payment_method_id` +
  `payment_date` + `is_paid`: passing a `payment_method_id` to `create_purchase` marks it paid
  immediately (defaulting `payment_date` to today); an unpaid purchase can be marked paid later via
  `POST /purchases/{id}/pay`. `Purchase.cancelled_at` mirrors `Sale.cancelled_at` — `cancel_purchase`
  reverses the stock increase via `StockService.decrease_quantity` per item (raises
  `InsufficientStockError` if that stock was already sold elsewhere, which — since it runs in the
  same session as the request's `get_db` — rolls back any items already reversed earlier in the
  loop) and does **not** revert the `Product.cost` overwrite from creation (no prior-cost history is
  kept; accepted limitation, same reasoning as not reversing promotions on a Sale cancel).
- **Stock** (`app/domain/stock.py`) has optional `color_id`/`size_id` — a product with no color or
  size variety can have a `Stock` row with both set to `None`. The `uq_stock_variant` unique
  constraint on `(product_id, color_id, size_id, branch_id)` does not dedupe rows where
  color/size are both `NULL` (Postgres treats `NULL <> NULL`), which is accepted as-is. The
  frontend (`StockPage.tsx`) pre-checks the already-loaded `useStocks()` list for a matching
  variant before submitting "Nuevo" and, if found, asks via `AlertDialog` whether to add the
  quantity to the existing row (`useIncreaseStock`) instead of creating a duplicate — this is a
  client-side courtesy only; the backend's `IntegrityError` → `BusinessRuleViolationError`
  translation in `StockService.create` is still the real enforcement for the non-`NULL` case.
- **Customer** (`app/domain/customer.py`) is a flat entity — `dni` (unique) + `name` — with full
  CRUD via the generic `CrudService` pattern, plus `GET /customers?q=` (case-insensitive substring
  match on `dni` OR `name`, `CustomerRepository.list_all(q)`) backing the checkout search box.
  `IntegrityError` on a duplicate `dni` is translated to `BusinessRuleViolationError` in
  `CustomerService.create`/`update`, same pattern as `StockService.create`. A `Sale` optionally
  carries `customer_id` (nullable FK, validated with `EntityNotFoundError` if set but unknown) —
  attaching a customer is entirely optional at checkout, never required to confirm a sale.
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

  `PromotionService._collect_satisfied_candidates` repeats a **2+ line** promotion's discount as
  many times as the cart holds complete sets: `repeat_count = min(cart_qty // line.min_quantity)`
  across all its lines, and each line's `effective_quantity` becomes `line.min_quantity *
  repeat_count` (capped by `line.max_quantity * repeat_count` if set) instead of the full matched
  cart quantity. So a "1 shirt + 1 shorts" combo with 2 of each in the cart discounts both pairs;
  with 2 shirts + 1 shorts it only discounts 1 of each, leaving the second shirt full price. A
  **single-line** promotion is deliberately exempt from this (`repeat_count` stays `None`, old
  behavior) — there `min_quantity` is just a threshold gate ("10% off if you buy 3+"), not a combo
  unit, so it keeps discounting every matching cart unit rather than only multiples of
  `min_quantity`. This distinction is load-bearing; do not merge the two code paths without
  re-checking `tests/test_sale_service.py`'s threshold-vs-combo tests.

  "Combo at a target final price" (e.g. shirt $15 + shorts $12 → combo price $25) is a **frontend-
  only** feature in `PromotionsPage.tsx` — the backend schema never changed. Given a final price and
  a distribution mode (uniform percentage, or the total discount split in equal-dollar shares
  across lines), the UI computes each line's `discount_type`/`discount_value` from the *products'
  current price* × `min_quantity` before submitting the normal `PromotionItemInput[]` payload; it's
  only offered when every line targets a `product_id` (not `category_id`), since a category line's
  actual matched product — and thus its reference price — isn't known until sale time.
- **Exchange/Return** is one entity covering both flows: `Exchange` (now also carries `branch_id`
  — denormalized from the parent `Sale.branch_id` at creation time so `ReportService` doesn't need
  a join — and a server-set `created_at`, same `server_default=func.now()` pattern as
  `Sale.created_at`) + `ExchangeReturnItem` (restocked) + `ExchangeNewItem` (destocked; empty list =
  a pure return) + `ExchangePayment` (signed `amount` — positive means the customer pays more,
  negative means a refund). `ExchangeService.create_exchange` validates that returned items were
  actually part of the original Sale and don't exceed the quantity sold *minus what prior Exchange
  records against the same Sale already returned* (via `ExchangeReturnItemRepository.list_by_sale`,
  a join through `ExchangeModel.sale_id` — `ExchangeReturnItem` has no `sale_id` of its own). This
  used to be a deliberately deferred limitation (checking only the original `SaleItem` quantity,
  letting the same units be returned twice across separate Exchange records) until it surfaced as a
  real stock drift bug in manual testing and was fixed. `ExchangeForm.tsx`'s new-item picker
  auto-fills `unit_price` from the selected stock's product price (via `useStockOptions`, which now
  also exposes `productId`/`price`) — still a plain editable `Input` afterward, just no longer
  starts at 0. The frontend shows exchanges wherever a sale is shown: `SaleDetailPanel.tsx` lists
  every `Exchange` tied to that sale (filtering `useExchanges()` by `sale_id`, same "acceptable at
  this scale" client-side filtering `SalesHistoryPage.tsx` already used), and both there and in
  `ExchangesPage.tsx`/`SalesHistoryPage.tsx`'s daily breakdown, `ExchangeItemsList.tsx` resolves each
  returned/new item's `stock_id` to a readable product/variant label instead of a bare count. Each of
  these three surfaces (`ExchangesPage.tsx`, `SaleDetailPanel.tsx`, and `SalesHistoryPage.tsx`'s daily
  breakdown) now renders every `Exchange` row as a clickable trigger opening a shared
  `ExchangeDetailPanel.tsx` in a `Dialog` — full returned/new items, payments, and the computed
  `balance` (`ExchangeDetailRead.balance = new_total - returned_total`, computed in
  `exchange_route.py::_to_detail_read`, same shape as `SaleDetailRead`'s totals) in one place instead
  of duplicating the breakdown UI three times.
- **`Exchange.cancelled_at`** mirrors `Sale.cancelled_at` — `ExchangeService.cancel_exchange` reverses
  the exchange's own stock effect (decreases what was restocked via the return, increases what was
  destocked via the new items) and calls `ExchangeRepository.mark_cancelled`. It only allows
  cancelling the **most recent non-cancelled** `Exchange` for that sale (`BusinessRuleViolationError`
  otherwise) — a deliberate simplification to avoid reasoning about out-of-order stock reversal when
  several exchanges chain off the same sale (e.g. M→L→M): cancelling an older one first could put a
  later exchange's return/new items in an inconsistent state relative to what's actually on the shelf.
  `list_by_sale`/`mark_cancelled` were added to `ExchangeRepository`; `ExchangeReturnItemRepository.
  list_by_sale` and the newly-added `ExchangeNewItemRepository.list_by_sale` both filter
  `ExchangeModel.cancelled_at.is_(None)` in their join, so a cancelled exchange's items no longer
  count toward the "already returned/given" totals used by `create_exchange`'s validation or by
  `SaleService.cancel_sale`'s net-restore below.
- **Exchange without a full refund**: `ExchangeCreate.waive_refund: bool = False` lets the cashier
  skip the payment-matching requirement when the computed `balance` favors the customer
  (`balance <= 0`, i.e. the new item is cheaper or a pure return) — the true `balance` is still
  always computed and persisted for history, only the "payments must sum to it" check is skipped.
  Passing `waive_refund=True` when `balance > 0` still raises `BusinessRuleViolationError` — the
  customer must pay a positive difference, it can't be waived. `ExchangeForm.tsx` only shows the "No
  reembolsar la diferencia" checkbox when `balance < 0`, and resets it whenever that stops being true
  (e.g. the cashier changes the items after checking it).
- **`SaleService.cancel_sale` restores the *net* current state of a sale's stock, not the original
  sale's items** — this is the fix for a real bug found in manual testing: cancelling a sale that had
  since been exchanged used to restore the *original* `SaleItem`s' stock, silently ignoring what the
  exchange(s) had already done, corrupting stock counts. `cancel_sale` now builds a per-`stock_id`
  delta (`net_restore`) starting from the original `SaleItem`s, subtracting quantities returned via
  every non-cancelled `Exchange` against that sale (`ExchangeReturnItemRepository.list_by_sale`), and
  adding quantities given via those same exchanges' new items
  (`ExchangeNewItemRepository.list_by_sale` — new for this). Cancelling the sale then
  increases/decreases each `stock_id` by its net delta in one pass, so what actually gets restored is
  whatever product is currently "out" because of the sale, regardless of how many exchanges happened
  in between. `SaleService.__init__` gained the two new repository dependencies to support this;
  `get_sale_service` wires them from the same request session as everything else.
- **Sale preview**: `SaleService.compute_totals` (subtotal/promotion/discount/total math, no
  persistence, no stock touched) is shared by `create_sale` and `POST /sales/preview` — the
  frontend calls `/sales/preview` live as the cart changes so the promotion/total can be shown
  *before* the sale is confirmed, then calls `POST /sales` with the same payload plus `payments`.
- **`SalePayment.amount_without_surcharge` is the net amount that counts toward covering
  `Sale.total`; `amount_with_surcharge` is the gross amount actually charged** (e.g. what a card
  terminal shows). `create_sale` sums `amount_without_surcharge` across payments and requires it to
  equal `computed.total` exactly, and separately re-derives the expected
  `amount_without_surcharge` from `amount_with_surcharge` and the `PaymentMethod.surcharge_percentage`
  (`amount_with_surcharge / (1 + surcharge% / 100)`, quantized to cents) to reject a
  client-manipulated pair. The frontend (`PaymentPanel.tsx`) makes the cashier enter the **gross**
  amount (what the card terminal shows) per payment line — `lib/payment.ts`'s `removeSurcharge` is
  the inverse of `applySurcharge` and computes how much of the sale that line actually covers; a
  "complete restante" button per line fills in the gross amount needed to cover exactly what's left
  uncovered by the other lines (`applySurcharge(remainingNet, method.surcharge_percentage)`). Get
  the direction backwards here and a card payment will silently look like it's short or over by the
  surcharge amount — this bit a manual test once (see git history for `sale_service.py`'s
  `create_sale` payment-validation block).
- **Sale listing shows what was sold, not an id**: `GET /sales` returns `SaleListRead` (`SaleRead` +
  `items_summary: str`), built per-sale by `SaleService.get_items_summary` — up to the first 2
  distinct products (deduped, cart order, `"Nombre xN"` when quantity > 1) plus `"y N más"` if there
  are more. `SalesHistoryPage.tsx` renders that instead of `"Venta #N"`, with the id kept as a small
  secondary badge. This is N+1 queries per list render (one per sale for its items, resolved via the
  same stock→product lookup as `compute_totals`) — accepted at a single POS's data volume, same
  reasoning as `ReportService`'s in-memory composition.
- **`Sale.created_at`** is server-set (`server_default=func.now()`, never accepted from the
  client) and is what the daily-balance report groups by; it did not exist before this feature and
  had to be backfilled onto existing rows via the column's DB default (see Database section).
- **Sale cancellation**: a `Sale` is otherwise append-only (see below), but `cancelled_at`
  (`app/domain/sale.py`) is the one exception — `SaleService.cancel_sale` restores stock (see the
  net-restore description under Exchange/Return above — it accounts for any exchanges against the
  sale, not just the original items) then calls `SaleRepository.mark_cancelled` (a narrow UPDATE, not
  a general `update()` — the repository still has no such method). Raises
  `BusinessRuleViolationError` if already cancelled. A cancelled sale stays in `GET /sales`/
  `GET /sales/{id}` for the record but is excluded from `ReportService.daily_cash_balance` entirely
  (see below) and the frontend hides its "Cambio / devolución" and "Cancelar" actions once cancelled.
- **Expense** (`app/domain/expense.py`) is a flat entity — `branch_id`, `payment_method_id`,
  `amount`, `description`, `date` — with full CRUD via the generic `CrudService` pattern (plus FK
  existence checks in `ExpenseService`, same shape as `StockService._ensure_references_exist`).
  Represents money paid out of a branch (e.g. buying cleaning supplies with register cash);
  `payment_method_id` records *what it was paid with*, reusing `PaymentMethod` rather than a
  separate concept. Deletable — `SalesHistoryPage.tsx`'s daily breakdown lists each day's expenses
  with a trash-icon button (`AlertDialog`-confirmed, same pattern as everything else destructive in
  this codebase) calling the plain `useDeleteExpense()` CRUD hook (`DELETE /expenses/{id}`, no
  special domain logic — unlike Sale/Purchase/Exchange, an Expense was never designed to be
  append-only, so this is a real delete, not a `cancelled_at` flag).
- **`PaymentMethod.is_cash`**: a boolean added specifically so daily-balance reporting has a
  reliable way to know which payments/expenses are physical cash-register money, instead of
  string-matching on `name` (e.g. `"Efectivo"`). Set it `True` on whichever payment method(s)
  represent the register; it defaults to `False` for everything else (card, transfer, etc.).
- **Daily cash balance report** (`app/services/report_service.py`,
  `GET /branches/{branch_id}/daily-balance`): not a persisted entity — `ReportService` composes
  `Sale`+`SalePayment`+`Expense`+`Purchase`+`Exchange`+`ExchangePayment`+`PaymentMethod` data in
  memory per branch (acceptable at a single POS's data volume) and groups by day into
  `sales_cash_total` (only payments whose method has `is_cash=True`), `sales_total` (all payments,
  informative only), `expenses_cash_total` (only expenses paid with an `is_cash` method),
  `purchases_cash_total` (only *paid* purchases — `is_paid=True` and not cancelled — with an
  `is_cash` `payment_method_id`, bucketed by `payment_date` not `created_at`), `exchanges_cash_total`
  (sum of `ExchangePayment.amount` for `is_cash` methods, bucketed by the exchange's `created_at`
  date — **can be negative**, unlike the other three totals, since a refund's `amount` is negative),
  and `balance = sales_cash_total - expenses_cash_total - purchases_cash_total +
  exchanges_cash_total`. Cancelled sales and cancelled/unpaid purchases are filtered out before
  aggregating. This is deliberately *cash-only* — a sale paid entirely by card contributes to
  `sales_total` but not to the balance. `SalesHistoryPage.tsx`'s per-day expand row mirrors this
  breakdown at the line-item level (which sales/expenses/paid-purchases/exchanges actually happened
  that day), not just the aggregate totals — client-side filtering of the already-loaded
  `useSales()`/`useExpenses()`/`usePurchases()`/`useExchanges()` lists by branch + date, same
  "acceptable at this scale" reasoning as the report itself.

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

Three more migrations, also applied: `dfb1b80f15e5` (`products.category_id`/`brand_id` loosened to
nullable — no backfill, just relaxing a constraint — plus `purchases.payment_method_id`/
`payment_date`/`is_paid`, the latter needing the same temporary-`server_default`-then-drop trick),
`304a27d28a95` (new `product_images` table; `purchases.cancelled_at`, nullable; and
`exchanges.branch_id`/`created_at` — `branch_id` is the one column in this project so far that
needed a **real backfill query**, not just a `server_default` constant, since its value differs per
row: `op.add_column(..., nullable=True)` → `op.execute("UPDATE exchanges SET branch_id =
sales.branch_id FROM sales WHERE sales.id = exchanges.sale_id")` → `op.alter_column(...,
nullable=False)`; watch for this shape whenever backfilling a new NOT NULL FK from data that
already lives in another table), and `f571daee19e8` (new `customers` table, `dni` unique; nullable
`sales.customer_id`, no backfill needed since it's optional permanently, not temporarily
nullable-during-migration).

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
                     # Size, Branch, PaymentMethod, Customer use it as-is; Color and Product got
                     # bespoke pages instead once they needed a color swatch / image thumbnail
    products/       # ProductsPage.tsx — list/grid view toggle, image_url cover field + thumbnail,
                     # optional category/brand ("Sin categoría"/"Sin marca" sentinel in the Select),
                     # file upload (uploadProductImage) or manual URL for the cover; ProductGallery.tsx
                     # (extra photos, only enabled once the product has an id — see ProductImage above)
    stock/          # StockPage.tsx — +/- adjustments require an AlertDialog confirmation
                     # (deliberately not audited server-side yet, see Known limitations); search
                     # by product name, branch filter, and sortable Producto/Cantidad/Sucursal
                     # column headers, all computed client-side over the already-loaded stock list;
                     # "Nuevo" pre-checks for an existing matching variant and offers to merge
                     # quantities instead of creating a duplicate (see Stock above)
    sale/           # the POS: SalePage/ProductPicker/CartPanel/PaymentPanel/cartStore.ts,
                     # CustomerPicker.tsx (optional, debounced dni/name search + inline create),
                     # SalesHistoryPage.tsx (daily balance, expandable per-day breakdown of
                     # sales/expenses/paid-purchases/exchanges — see Daily cash balance above),
                     # SaleDetailPanel.tsx (single-sale detail: cancel action, inline exchange,
                     # read-only list of this sale's past exchanges, a thumbnail + resolved name
                     # per line, applied-promotion detail link, customer name if attached).
                     # ProductPicker.tsx groups stock rows by product (one card per product, a
                     # DropdownMenu variant picker when there's more than one color/size in the
                     # branch) instead of one card per Stock row — cartStore/CartPanel are still
                     # keyed by stock_id underneath, this is purely a picker-UI grouping.
    exchanges/      # ExchangesPage.tsx (pick-a-sale + create, branch column + branch filter
                     # resolved by joining each Exchange's sale_id against useSales()) and
                     # ExchangeForm.tsx (the returns/new-items/payments fields, shared with
                     # SaleDetailPanel so a cambio/devolución can be started either from /cambios
                     # or from a sale's own detail panel without navigating away — new-item
                     # unit_price auto-fills from the selected stock's product price). Both this
                     # page and SaleDetailPanel/SalesHistoryPage render item names via
                     # ExchangeItemsList.tsx (see Exchange/Return above), not bare counts.
    purchases/      # PurchasesPage.tsx (list + create, optional "¿Ya se pagó?" payment method +
                     # date) and PurchaseDetailPanel.tsx (click a row to see its PurchaseItems with
                     # product image/name, mirrors SaleDetailPanel; pay/cancel actions + status badge)
    promotions/     # PromotionsPage.tsx (create/edit, full item replace on save — see Promotion
                     # in Scope above, including the frontend-only "precio final del combo" toggle)
                     # and PromotionDetail.tsx, a read-only "what's in this promo" breakdown shared
                     # between a "Ver detalle" row action on /promociones and a link next to
                     # "Promoción aplicada" in CartPanel.tsx during a sale
    shared/useStockOptions.ts  # stock-row -> product/variant/image/price resolver, see gotcha below
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
  resolve `image_url`, `hex_code`, and (on `useStockOptions.ts` — added for `ExchangeForm.tsx`'s
  price auto-fill) `productId`/`price`, for display in the product picker, cart lines, exchange
  forms, and stock table.
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
- **No stock transfer between branches**: `StockService` only has `increase_quantity`/
  `decrease_quantity`; moving stock from one branch's row to another's is two manual calls today,
  with no atomic "transfer" operation or audit trail of the move.
- **Exchange doesn't touch promotions**: `ExchangeService.create_exchange` computes return/new-item
  amounts from `unit_price * quantity` only (`app/services/exchange_service.py`) — it doesn't look
  at the original `SaleItem.promotion_id` or reverse/prorate a `Sale.promotion_discount` on a
  return. Returning an item that was sold at a promotional price currently refunds it at full
  `unit_price` unless the caller passes a lower price manually.
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
  re-confirmed as deferred (the user chose "esperar al sistema de login" over adding an anonymous
  audit log) — revisit once there's a login/user system to attribute the change to.
- **Stock-duplicate merge is a frontend-only courtesy**: `StockPage.tsx` checks the already-loaded
  `useStocks()` list before submitting "Nuevo" and offers to merge quantities into an existing
  matching row — but nothing stops a second browser tab, or a direct `POST /stocks`, from racing
  past that check. The `uq_stock_variant` `IntegrityError` → `BusinessRuleViolationError` in
  `StockService.create` is the real backend enforcement, and it still doesn't cover the `color_id`/
  `size_id` both-`NULL` case (see Stock above) — a race there would silently create a second row.

None of these are scheduled — flag them to the user before picking one up, since each implies a
design decision (e.g. how usage caps should be scoped, whether category combos should be
per-product) similar to the ones resolved for the Promotion redesign above.
