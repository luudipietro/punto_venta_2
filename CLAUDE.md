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

## Authentication and authorization

The app requires a login — every route except `POST /auth/login` and `GET /brand-settings` needs a
valid JWT. Two roles: `admin` and `empleado` (`app/domain/user.py`'s `UserRole` StrEnum). An
`empleado` has a fixed `branch_id` they can never change; an `admin` has `branch_id = None` and
works across all branches.

- **`User`** (`app/domain/user.py`) follows the `Customer` entity's file-by-file pattern (domain
  dataclass → `app/infrastructure/db/models/user_model.py` → `app/repositories/user_repository.py`
  → schemas → service → route) with one deliberate deviation: `UserService`
  (`app/services/user_service.py`) does **not** subclass the generic `CrudService` — hashing the
  password and validating the role/branch invariant (`empleado` requires a `branch_id`, `admin`
  must not have one) are exactly the "real business rules" `base_service.py`'s own docstring says
  warrant skipping the base class. `UserCreate`/`UserUpdate` accept a plaintext `password` field;
  `UserRead` never exposes `password_hash`. `UserRepository` adds a `get_by_username` lookup (no
  prior exact-match-by-non-id-field precedent in the codebase — `CustomerRepository.list_all`'s `q`
  param does substring `ilike`, not exact match).
- **Password hashing and JWT** live in `app/core/security.py` (framework-agnostic, like
  `config.py`/`exceptions.py`): `bcrypt.hashpw`/`checkpw` directly (plain `bcrypt`, not `passlib` —
  avoids passlib's stale bcrypt-72-byte-warning issue with modern bcrypt versions) and
  `jwt.encode`/`decode` (PyJWT) with `Settings.secret_key`/`jwt_algorithm`/
  `access_token_expire_minutes` (4h) from `app/core/config.py`. The JWT payload carries `sub` (user
  id), `role`, and `branch_id` — `branch_id` is only ever meaningful for an `empleado`'s token
  (baked in at login), never trusted from an admin's token for authorization decisions (an admin's
  *active* branch is a client-side UI convenience only, see below).
- **`app/core/auth.py`** — `get_current_user` (via `HTTPBearer`, not `OAuth2PasswordBearer`: nothing
  in this app uses Swagger's OAuth2 flow UI, and `HTTPBearer(auto_error=False)` lets it raise its
  own Spanish 401 message) decodes the token and re-fetches the `User` row fresh from the DB every
  request (so a deleted/edited user is reflected immediately, not just at token-issue time);
  `require_admin` wraps it with a role check; `acting_branch_id_of(user)` returns `None` for an
  admin (no restriction) or the user's `branch_id` for an `empleado` — this is the one helper every
  branch-scoped route calls before passing the result into a service method.
- **Login** (`POST /auth/login`, `app/routes/auth_route.py`) takes a plain JSON body
  (`LoginRequest`), not `OAuth2PasswordRequestForm` — keeps it consistent with the rest of the API
  (and the frontend's `apiClient`) always speaking JSON, never form-encoded. `GET /auth/me` lets the
  frontend validate a persisted token on page reload without re-sending credentials.
- **Router-level gating** (`app/routes/api_router.py`): a `dependencies=[Depends(get_current_user)]`
  list is passed to `include_router(...)` for every router except `auth_router` (login must be
  reachable unauthenticated), `user_router` (already fully admin-gated at its own `APIRouter(...)`
  construction), and `brand_settings_router` (its `GET` is deliberately public — the login page
  itself needs to render the custom logo/company name before anyone is authenticated; its `PUT` is
  admin-only via a route-level `dependencies=[Depends(require_admin)]` instead). Catalog-management
  routers with a mixed read/write split (Category, Brand, Color, Size, PaymentMethod, Promotion,
  Product, Branch) additionally put `dependencies=[Depends(require_admin)]` directly on each
  mutating endpoint's decorator, so a non-admin's `GET` still succeeds (needed for dropdowns/search
  everywhere in the POS) while `POST`/`PUT`/`DELETE` 403. Sale/Stock/Purchase/Exchange/Expense stay
  uniformly open to any logged-in user at the router level — their branch restriction is enforced
  one layer down, inside the service (see next point), not by blocking the route entirely.
- **Branch-scoped authorization pattern**: `SaleService.create_sale`/`cancel_sale`,
  `PurchaseService.create_purchase`/`mark_paid`/`cancel_purchase`,
  `ExchangeService.create_exchange`/`cancel_exchange`, `ExpenseService.create`/`update`, and
  `StockService.increase_quantity`/`decrease_quantity` each gained an **optional, keyword-only**
  `acting_branch_id: int | None = None` parameter — optional and keyword-only specifically so every
  existing test that constructs these services directly with positional args keeps working
  unchanged. `None` means "no restriction" (an admin, or an internal call already gated by a
  higher-level check — e.g. `create_sale`'s own `_stock_service.decrease_quantity(...)` calls don't
  re-pass `acting_branch_id`, since the top-level branch check already ran). When the branch doesn't
  match, a new `PermissionDeniedError` (`app/core/exceptions.py`, mapped to HTTP 403 in
  `exception_handlers.py`) is raised — chosen over reusing `BusinessRuleViolationError` (422)
  because this is semantically "you're authenticated, this just isn't yours to do," not an
  invariant violation; this mirrors the pre-existing precedent in `PurchaseService.create_purchase`
  of checking `stock.branch_id != branch_id`, just parameterized by *who's* acting instead of always
  enforcing the same check unconditionally. Every mutating route in these five areas computes
  `acting_branch_id_of(current_user)` and forwards it into the service call — see any of
  `sale_route.py`/`purchase_route.py`/`exchange_route.py`/`expense_route.py`/`stock_route.py`'s
  `/increase`/`/decrease` handlers for the exact shape. Stock **reads** are never restricted — an
  empleado can see stock in every branch (read-only), only *writing* to another branch's stock is
  blocked. Purchases and Expenses are **not** admin-only — the user explicitly confirmed an empleado
  should be able to register both, scoped to their own branch, same as Sales.
- **Seeded admin account**: the first Alembic migration for `users`
  (`alembic/versions/0c235a9d5c3c_add_users_table.py`) inserts one row via a raw `op.execute(...)` —
  username `admin`, password `admin123` (change it from `/catalogo/usuarios` after first login), a
  precomputed bcrypt hash pasted as a literal string. This is the **first** migration in the repo
  that seeds data (every prior migration was schema-only) — the hash is hardcoded rather than
  imported from `app.core.security` to keep migrations decoupled from application code that might
  change independently.
- **Test fixture**: adding auth would have broken every existing route test (`tests/conftest.py`'s
  `client` fixture made unauthenticated requests) — instead of touching ~15 test files, the `client`
  fixture now also overrides `get_current_user` to return a fixed admin `User`, so every existing
  test transparently runs "as admin" with zero changes to its own file. A second fixture,
  `client_no_auth`, skips that override for the newer tests that specifically exercise real
  401/403/branch-mismatch behavior (`tests/test_auth_routes.py`, `tests/test_route_authorization.py`,
  `tests/test_branch_authorization.py`).
- **Changing your own password requires the current one**: `UserService.update` takes optional
  `current_password`/`acting_user` kwargs — if `password` is being changed **and**
  `acting_user.id == user_id` (a user editing their own account), it requires `current_password` and
  verifies it with `verify_password` against the existing hash (`BusinessRuleViolationError`
  otherwise). Resetting a *different* user's password (an admin acting on someone else) still needs
  nothing extra — that's a legitimate admin action, not the security hole. This closes a real gap: an
  unattended/stolen admin session could otherwise be used to silently take over the account by
  setting a new password with nothing but the browser tab already open. `PUT /users/{id}`
  (`user_route.py`) now also injects `current_user` (in addition to the router's `require_admin`) so
  the service can compare "is this self or someone else." Frontend: `UsersPage.tsx` shows an extra
  "Contraseña actual" field only when `editingId === authUser?.id` and the password field is
  non-empty.

## Security hardening

Findings from a manual security review, fixed in place:

- **`Settings.secret_key` defaulting to a hardcoded string (`DEFAULT_SECRET_KEY =
  "dev-secret-change-me"` in `app/core/config.py`) is a real, confirmed auth-bypass vector, not a
  theoretical one** — this default is public (it's committed source), so anyone who reads it can
  forge a valid JWT for any user (e.g. `sub: "1"`, the seeded admin) and authenticate without ever
  knowing a password, as `jwt.decode` only checks the signature, not who issued it. This was
  actually found *in effect* on this project's own dev deployment — the running backend had never
  had `SECRET_KEY` set in its `.env`, so it was silently signing every session with the public
  default. `create_app()` (`app/main.py`) now logs a loud `logger.warning(...)` at startup whenever
  `settings.secret_key == DEFAULT_SECRET_KEY`, specifically so this can't silently recur — **treat
  that warning as a stop-what-you're-doing signal**, not a lint nit. The default itself is left in
  place (removing it would break the documented zero-config `uv run uvicorn ...` local quick-start),
  the warning is the actual mitigation. Real deployments must set a real `SECRET_KEY` in `.env`
  (`python -c "import secrets; print(secrets.token_urlsafe(48))"` is a reasonable way to generate
  one) — rotating it immediately invalidates every existing session, which is also the only way to
  force-logout everyone if a leak is ever suspected (see the "JWTs can't be revoked" known
  limitation below — there's no other mechanism).
- **`/auth/login` had no brute-force protection** — `app/core/rate_limit.py` (new, no external
  dependency) is a minimal in-memory limiter: 5 failed attempts from the same client IP within 15
  minutes returns `429` regardless of whether the credentials on that 6th attempt are actually
  correct. Keyed by **IP, not username** — limiting by username would let an attacker lock out a
  *known legitimate* account just by throwing bad passwords at it from anywhere. `auth_route.py`'s
  `login` wraps `service.authenticate(...)` in a try/except that calls `record_login_failure`/
  `clear_login_failures` around it. **In-memory and per-process on purpose**: this app runs as a
  single Uvicorn process for one shop, so there's no shared cache to keep state in; a
  horizontally-scaled deployment (multiple workers/instances) would need a shared store (Redis, a DB
  table) instead for this to still work correctly — flagged in the module's own docstring so it's
  not forgotten if that ever changes. `rate_limit.reset_all()` exists purely for test isolation
  (`tests/test_auth_routes.py`'s new rate-limit test calls it before and after, since the module-level
  `_failures` dict otherwise persists for the whole pytest process and could make an unrelated later
  test's login unexpectedly hit `429`).
- **No password length/complexity requirement existed** — `UserCreate.password`/`UserUpdate.password`
  (`app/schemas/user_schema.py`) now require `min_length=8` via Pydantic's `Field(...)`. A floor, not
  a full policy (no complexity/rotation/reuse rules) — proportionate to this app's scope as a
  single-shop internal tool, not a public-facing service.
- **Reviewed and found already solid, no changes needed**: no raw/string-interpolated SQL anywhere
  outside migrations (everything goes through SQLAlchemy's parameterized ORM — no injection surface);
  no `dangerouslySetInnerHTML`/`eval`/`new Function` anywhere in the frontend (React's default
  escaping covers rendered content — no XSS vector found); every router is accounted for in
  `api_router.py`'s auth-dependency wiring (audited exhaustively — no router accidentally missing
  `get_current_user`/`require_admin`); the generic `Exception` handler
  (`app/core/exception_handlers.py`) never leaks a stack trace to the client, only to the server log;
  `POST /uploads/images` already had solid defenses (server-generated UUID filename — no path
  traversal via a user-supplied name; MIME-type allowlist; 5MB cap) even though it trusts the
  client's `Content-Type` header rather than sniffing actual file bytes — accepted as low-risk given
  those other protections, rather than adding a Pillow dependency to verify file content too.
- **Camera photos routinely exceeded that 5MB cap on mobile** — found in real usage (an iPhone),
  not hypothetically: `frontend/src/lib/image.ts`'s `compressImageForUpload()` resizes to a 1600px
  max dimension and re-encodes as JPEG (canvas-based, ~quality 0.82) *client-side*, before the
  upload request is even sent, and every `uploadProductImage()` call (cover photo, gallery, logo,
  hero images — see below) routes through it. Raising the backend's cap instead would only have
  bought a bit more headroom before an even higher-megapixel phone camera hit the same wall; this
  fixes it at the source. Skips GIFs (canvas would flatten animation) and anything already under
  400KB, and falls back to the original file if the browser can't decode it — never blocks an
  upload. Also removed `capture="environment"` from the two file inputs that had it
  (`ProductsPage.tsx`'s cover photo, `ProductGallery.tsx`) — on the same iPhone, that attribute was
  forcing the camera to open directly instead of showing the normal "Photo Library / Take Photo"
  picker, so there was no way to pick an existing photo from the gallery at all.
- **`crypto.randomUUID()` silently broke every "Agregar" button when tested from a phone over
  plain HTTP** — found while testing the app from a phone on the local network
  (`http://192.168.0.68:5173`, not `localhost`): that origin is not a *secure context* (HTTPS, or
  the `localhost` exemption), and `crypto.randomUUID` simply doesn't exist there, so calling it
  threw and the click handler did nothing with no visible error. It was used as a local React list
  key (never persisted, never sent to the server) in nine places — `PaymentPanel.tsx`,
  `ExchangeForm.tsx` (×2), `PurchasesPage.tsx` (×3), `PromotionsPage.tsx` (×2), and
  `PriceTagsPage.tsx`'s manual item form. All nine now use `generateLineKey()`
  (`frontend/src/lib/id.ts`, `` `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` ``)
  instead — since these keys never leave the browser, there was never a need for
  cryptographic-grade randomness in the first place. Watch for this same trap with any other
  `crypto.*` API in future work — they're gated the same way.
- **Uploaded image URLs are absolute, with the origin baked in at upload time** —
  `uploadProductImage()` (`frontend/src/api/product.ts`) prefixes the backend's relative path with
  `API_BASE_URL` *once*, at upload, and that full string is what gets stored
  (`Product.image_url`/`ProductImage.url`/`BrandSettings.logo_url`/`.hero_images`). This is
  harmless in production (`API_BASE_URL` is the relative path `/api` there, not a real origin — see
  Production deployment) but bit us in local dev while testing from a phone: images uploaded
  earlier from the PC's own browser had `http://localhost:8000/...` baked in, which the phone can
  never reach (its own `localhost` is the phone, not the PC) — the API's JSON data loaded fine (a
  same-session CORS/host problem, see below), but every `<img>` on the page stayed broken. Fixed
  for existing rows with a one-off `UPDATE ... SET image_url = REPLACE(image_url, 'localhost:8000',
  '<lan-ip>:8000')` (also on `product_images.url`, `brand_settings.logo_url`, and
  `brand_settings.hero_images` — that last one is a JSON array, so it needs the
  `REPLACE(col::text, ...)::json` cast shape) — not a schema migration, just data hygiene after a
  dev-only environment mismatch. If this bites again, re-run the same kind of `UPDATE`, or just
  re-upload the affected images once every dev server is consistently reachable at one address.
- **Testing this app from a phone on the same local network, before deploying**: needs three
  things lined up at once, all dev-only (none of this applies in production, where everything is
  same-origin behind one Nginx). (1) Every dev server needs `--host` (`uvicorn ... --host 0.0.0.0`,
  `vite ... --host`) — by default each one only binds `127.0.0.1`, invisible to any other device.
  (2) `frontend/.env.local`/`storefront/.env.local` (gitignored, Vite-only — see `vite.dev/guide/
  env-and-mode`) need `VITE_API_BASE_URL` pointed at the PC's LAN IP, e.g.
  `http://192.168.1.23:8000` — the default `localhost:8000` fallback in `api/client.ts` means the
  *phone's own* localhost otherwise, not the PC's. (3) The backend's `CORS_ORIGINS` (`app/core/
  config.py`, overridable via the project-root `.env` — `Settings`' `env_file=".env"` — since
  `BaseSettings` replaces the field's Python-code default outright rather than merging with it, the
  override must re-list `localhost:5173`/`5174` alongside the LAN origins, not just add to them)
  needs those same LAN-IP origins added, or the browser blocks the API responses even though the
  server received the request fine. All three read their config only at process start — editing
  any of `.env`/`.env.local` needs a full restart of that one process to take effect, not just a
  page reload.
- **Deliberately left as-is (explicit product decision, not overlooked)**: `GET /sales`,
  `/purchases`, `/exchanges`, `/customers` and similar read endpoints are not branch-scoped — any
  logged-in empleado can read another branch's sales/purchases/exchanges (never write to them; see
  the branch-scoped authorization pattern above, which still applies to every mutation). Same
  reasoning as `Stock` reads already being unrestricted (see Scope below): cross-branch visibility is
  useful in a multi-branch shop, and was confirmed intentional rather than changed.

## Scope

Fully implemented, following the same per-entity file pattern throughout: Category, Brand, Color
(with `hex_code`), Size, Branch, Product/ProductImage, Stock (with `/increase` and `/decrease`
quantity-adjustment endpoints), PaymentMethod (with `is_cash`/`surcharge_percentage`), Customer
(with `dni`/`name`), Sale/SaleItem/SalePayment, Purchase/PurchaseItem, Promotion,
Exchange/ExchangeReturnItem/ExchangeNewItem/ExchangePayment, Expense, User (see **Authentication and
authorization** above), and BrandSettings (a single-row logo/company-name/colors settings table, see
below). A React/Vite frontend (`frontend/`, see the **Frontend** section below) covers the whole
API. The original domain model is now fully covered.

- **BrandSettings** (`app/domain/brand_settings.py`, table `brand_settings`) is a deliberately
  minimal single-row table (`id` always `1`) — there's no generic key-value settings pattern
  elsewhere in this codebase to mirror, so this is the simplest possible shape rather than a more
  general "app settings" abstraction. `BrandSettingsService.get()` returns a hardcoded in-code
  default (`"Punto de Venta"` / `/brand/logo.svg`, matching `frontend/src/theme/brand.config.ts`'s
  original static values) when the table is empty, so no migration-time seed row is needed.
  `PUT /brand-settings` (admin-only) upserts it; logo upload reuses the existing
  `POST /uploads/images` endpoint unchanged (`ProductsPage.tsx`'s cover-photo upload flow) — nothing
  about that endpoint is product-specific, `BrandSettingsPage.tsx` just calls the same
  `uploadProductImage()` helper and stores the returned URL, now via `LogoCropDialog.tsx` first (see
  below). `frontend/src/theme/brand.config.ts` still holds the **factory-default** logo/company
  name/colors, read via `useBrandSettings()` with those static values as the fallback/loading-state
  default so there's no flash-of-no-brand before the query resolves — but colors are no longer
  code-only (see "Brand colors" below).

- **Brand colors**: `BrandSettings.colors` is an optional JSON column
  (`app/infrastructure/db/models/brand_settings_model.py`, `sa.JSON`, migration
  `9d3c1b4f7a2e_add_brand_settings_colors.py`) storing `{"light": {...}, "dark": {...}}`, each a flat
  dict of 14 CSS color strings (`background`, `foreground`, `card`, `card_foreground`, `primary`,
  `primary_foreground`, `secondary`, `secondary_foreground`, `muted`, `muted_foreground`, `accent`,
  `accent_foreground`, `border`, `ring` — deliberately mirrors `index.css`'s `:root`/`.dark` tokens,
  *not* including `destructive`/`sidebar-*`/`chart-*`, which are utility/semantic colors rather than
  "brand"). Kept as a raw `dict` through the domain layer (`app/domain/brand_settings.py`) rather
  than a nested dataclass — it's presentation data, not a business invariant this layer needs to
  validate; validation instead happens at the schema boundary (`app/schemas/brand_settings_schema.py`'s
  `BrandColorSet`/`BrandColors` Pydantic models, snake_case field names — the wire format the
  frontend's `api/brandSettings.ts` `ApiColorSet` mirrors exactly, same convention as every other
  snake_case API type in this codebase).
  - `frontend/src/theme/brand.config.ts`'s `BrandColorSet` interface expanded from 2 tokens
    (`primary`/`primaryForeground`) to the same 14, camelCase (the established convention in that
    file) — its `colors.light`/`.dark` are literally copy-pasted from `index.css`'s `oklch(...)`
    values, so an unconfigured install looks identical to before this feature.
  - `frontend/src/theme/ThemeProvider.tsx`'s `applyTheme(theme, overrides)` now sets all 14 CSS
    custom properties (previously only `--primary`/`--primary-foreground`/`--sidebar-primary(-
    foreground)`/`--ring`), merging `{...brandConfig.colors[theme], ...overrides}` token-by-token —
    `overrides` comes from `useBrandSettings()`'s `colors?.[theme]` (converted from the API's
    snake_case via `fromApiColorSet()` in `lib/color.ts`), so any token the admin hasn't touched
    falls back to the default. **`ThemeProvider` now has to sit *inside* `QueryClientProvider`** in
    `App.tsx` (the two were swapped) since it calls `useBrandSettings()`, a react-query hook.
  - `frontend/src/modules/settings/BrandSettingsPage.tsx` renders 14×2 native
    `<input type="color">` pickers (two `ColorEditor` columns, light/dark, each with its own
    "Restablecer" button) — seeded from the DB override if present, else from
    `cssColorToHex(brandConfig.colors[theme][token])` (`lib/color.ts` — `<input type="color">` only
    accepts hex, so the `oklch(...)` defaults need converting). On save, `toApiColorSet()` converts
    the camelCase local state back to the API's snake_case shape.
  - `frontend/src/lib/priceTags.ts`'s price color also respects this: `PriceTagsPage.tsx` passes
    `brand?.colors?.light?.primary ?? brandConfig.colors.light.primary` as `primaryColor` — only the
    price number on a printed cartel is tied to the brand palette, not its border or footer text
    (those stay fixed grays regardless of configured color).
  - **`frontend/src/lib/color.ts`** (new) holds `resolveColorRgb()`/`cssColorToHex()` (shared by
    `priceTags.ts` and `BrandSettingsPage.tsx` — see the canvas-pixel-read gotcha under "Price tag
    generator" below) and `fromApiColorSet()`/`toApiColorSet()` (the snake_case ⇄ camelCase
    converters between the wire format and `BrandColorSet`).
- **Favicon and tab title follow the brand too**: `frontend/src/components/BrandMetaSync.tsx`
  (mounted once in `App.tsx`, alongside `ThemeProvider`) sets `document.title` and the
  `<link rel="icon">` href from `useBrandSettings()`'s `company_name`/`logo_url` (same
  `?? brandConfig...` fallback pattern as everywhere else). Superseded the old static
  `index.html` `<title>frontend</title>`/`/favicon.svg` the moment the query resolves.
- **Logo crop on upload**: `frontend/src/modules/settings/LogoCropDialog.tsx` — selecting a file in
  `BrandSettingsPage.tsx` no longer uploads it straight away; it opens a freeform crop dialog first
  (drag to move, drag a corner handle to resize a rectangle over the image, plain pointer events, no
  new dependency) so a logo that comes in oversized/off-center can be trimmed before it's saved,
  without the admin needing their own image editor. "Aplicar recorte" draws the selected region onto
  a canvas at its natural pixel size and uploads that as a new `File` via the same
  `uploadProductImage()` call as before. The crop stage's checkerboard/handle colors are **hardcoded
  neutral values** (`#ffffff`/`#d4d4d4`/`#3b82f6`), not theme CSS vars — a dark-mode stage would
  otherwise blend a typically-dark logo into the background, and since colors are now
  admin-configurable, `--primary` itself could theoretically end up close to the image's own colors
  too. An image-editing tool needs to look the same regardless of the app's current theme.

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
  `ProductService.delete`, `StockService.delete`, `CustomerService.delete`, `PromotionService.
  delete`, and now (as of this round) `BranchService.delete`, `CategoryService.delete`,
  `BrandService.delete`, `ColorService.delete`, `SizeService.delete`, and `PaymentMethodService.
  delete` each override the base `CrudService.delete` to catch `IntegrityError` (from a
  still-referencing FK — e.g. a Product with stock, a Branch with sales, or a Stock with
  sales/purchases/exchanges) and re-raise it as `BusinessRuleViolationError` with a
  specific-per-entity Spanish message, same pattern `StockService.create` already used for the
  `uq_stock_variant` conflict (see Stock below). Every entity in the app now has this coverage —
  the catch is a blanket `except IntegrityError`, so it isn't limited to one specific FK per
  entity (e.g. `ProductService.delete` catches a referencing `Stock` row just as well as a
  referencing `ProductImage`). Before this, deleting a referenced row surfaced as an unhandled
  `IntegrityError` → generic 500 → (per the CORS note above) a misleading "CORS header missing"
  error in the browser console instead of a real error message. `PromotionService.delete` also
  has to delete the promotion's own `PromotionItem` rows first (`delete_by_promotion`, same as
  `update()` already did) before deleting the parent — `promotion_items.promotion_id` has no
  `ondelete=CASCADE`, so every promotion (which always has ≥1 item) would otherwise fail to delete
  regardless of whether it was ever used in a sale.
- **Dates render as dd/mm/yyyy** everywhere in the frontend via `formatDate`/`formatDateTime` in
  `frontend/src/lib/format.ts` (an `Intl.DateTimeFormat('es-AR', ...)` instance) — added because the
  default `toLocaleDateString()`/raw-ISO rendering used inconsistently across pages read as
  yyyy/mm/dd-ish or locale-dependent. `formatDate` expects a bare `YYYY-MM-DD` (appends `T12:00:00`
  before parsing, to dodge UTC-midnight rolling back a day in negative-UTC-offset browsers);
  `formatDateTime`/`formatTimestamp` expect a full ISO timestamp. Prefer these over ad hoc
  `new Date(...).toLocaleString()` calls in new code.
- **Timestamps are naive UTC end-to-end but always displayed/grouped in Argentina time**:
  `Sale.created_at`/`Exchange.created_at` (`server_default=func.now()`, Postgres UTC) are stored and
  sent over the wire as naive datetimes with no `Z`/offset suffix — this used to cause a real bug
  found in manual testing where a sale made late at night ART showed up under the *next* day (UTC
  is 3h ahead of ART, and the frontend was parsing the naive string as browser-local time instead
  of UTC, so it was neither correctly shifted nor correctly left alone). Fixed at the read/render
  boundaries only, storage stays naive UTC: `app/services/report_service.py`'s `_to_art_date`
  attaches `UTC` tzinfo then converts to `ZoneInfo("America/Argentina/Buenos_Aires")` before
  `.date()` for the daily-balance report's day-grouping (needs the `tzdata` package on Windows,
  where the OS doesn't ship IANA zone data for Python's stdlib `zoneinfo` to read — already added
  to `pyproject.toml`); `formatDateTime`/`formatTimestamp` (`frontend/src/lib/format.ts`) append a
  `Z` to the naive ISO string before parsing (so `Date` treats it as UTC, not local time) and format
  with `timeZone: 'America/Argentina/Buenos_Aires'`; `SalesHistoryPage.tsx`'s own client-side
  per-day grouping (`toArtDateKey`, using the `Intl.DateTimeFormat('en-CA', ...)` yyyy-mm-dd trick)
  mirrors the same conversion so its sale/exchange membership per day agrees with what the backend
  bucketed. `formatTimestamp` (new this round, keeps the time-of-day) is used where showing the
  hour matters (`SaleDetailPanel.tsx`'s "Venta #N" header); `formatDateTime` stays date-only for
  places that only ever showed a date (`ExchangeDetailPanel.tsx`). `Expense.date`/`Purchase.
  payment_date` are plain user-entered `date` columns, not `func.now()`-derived — unaffected by any
  of this.
- **Category, Brand, Color, and Size are create/delete-only — renaming them after creation is
  intentionally impossible.** Confirmed with the user: since `Stock`/`Product` reference these by
  id, renaming e.g. Size "M" to "L" after stock already exists in that row would make the
  historical stock/sales silently look like they were always size L. `PUT /categories/{id}`,
  `/brands/{id}`, `/colors/{id}`, and `/sizes/{id}` were removed entirely (405 now) along with their
  now-unused `CategoryUpdate`/`BrandUpdate`/`ColorUpdate`/`SizeUpdate` Pydantic schemas — the lock
  is enforced server-side, not just hidden in the UI. `CategoryService`/`BrandService`/
  `SizeService` still inherit `CrudService.update` (dead code now that no route calls it; left
  as-is rather than also stripping the method, since `CrudService` is meant to be used as-is per
  CLAUDE.md's own service conventions). Frontend: `SimpleCatalogPage.tsx` (shared by
  `CategoriesPage.tsx`/`BrandsPage.tsx`/`SizesPage.tsx`) gained an `allowEdit?: boolean` prop
  (default `true`, set to `false` for these three) that hides the "Editar" pencil button but keeps
  create/delete — `Branch`/`PaymentMethod` still pass `allowEdit` unset (or omit it) to keep
  editing. `ColorsPage.tsx` is the one bespoke (non-`SimpleCatalogPage`) catalog page, so its
  edit-dialog branch/`openEditDialog`/`useUpdateColor` call were removed directly rather than
  routed through a shared prop. `Color.hex_code`/`Brand.description`/`Category.description` are
  now locked too, for simplicity (a partial lock — name fixed, other fields still editable — was
  considered and explicitly rejected in favor of "lock everything, simplest to implement and
  explain").
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
- **Replacing or removing an image now deletes the old file from disk, not just the DB row** —
  `app/core/media.py`'s `delete_media_file(url)` (best-effort, silently no-ops on `None`, a static
  frontend asset like the default `/brand/logo.svg`, or a file already missing) is called from
  `ProductService.update` (when `image_url` actually changes, comparing against the pre-update row),
  `ProductService.delete`, `ProductImageService.remove_image`, and `BrandSettingsService.update`
  (logo replacement). Found as a real, already-in-effect problem during a hosting capacity review,
  not a hypothetical: nothing anywhere ever deleted the physical file on a replace/remove/delete —
  in this project's own dev `media/products/` folder, 12 of 15 files on disk were already orphaned
  (unreferenced by any product) purely from routine testing. Not urgent at typical volumes (disk math
  in the capacity review put it at tens of MB/year of extra orphaned bytes even unfixed), but it grew
  without any bound, so it's fixed now rather than left as a known limitation.
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
  `PurchasesPage.tsx`'s "Nueva compra" dialog has two "+ Crear producto nuevo"/"+ Crear variante
  nueva" buttons (disabled until a branch is picked, same gate as adding a line item) opening
  `ProductQuickCreateDialog.tsx`/`StockQuickCreateDialog.tsx` — minimal create forms (no image
  upload/gallery, no duplicate-variant merge check like `StockPage.tsx` has, since here the cashier
  is deliberately creating a new variant) that call the same `useCreateProduct`/`useCreateStock`
  mutations the full catalog pages use. Creating a product with no existing stock chains straight
  into the stock dialog with that product preselected (a bare `Product` isn't purchasable —
  `PurchaseItem` only stores `stock_id`); the new stock's `branch_id` is locked to the purchase's
  own branch and starts at `quantity=0`, since the purchase itself is about to increase it. No
  backend changes were needed — `PurchaseService.create_purchase` only ever required a valid
  `stock_id` whose `branch_id` matches, nothing blocked creating that row moments earlier.
- **Stock** (`app/domain/stock.py`) has optional `color_id`/`size_id` — a product with no color or
  size variety can have a `Stock` row with both set to `None`. The `uq_stock_variant` unique
  constraint on `(product_id, color_id, size_id, branch_id)` does not dedupe rows where
  color/size are both `NULL` (Postgres treats `NULL <> NULL`), which is accepted as-is. The
  frontend (`StockPage.tsx`) pre-checks the already-loaded `useStocks()` list for a matching
  variant before submitting "Nuevo" and, if found, asks via `AlertDialog` whether to add the
  quantity to the existing row (`useIncreaseStock`) instead of creating a duplicate — this is a
  client-side courtesy only; the backend's `IntegrityError` → `BusinessRuleViolationError`
  translation in `StockService.create` is still the real enforcement for the non-`NULL` case.
- **Customer** (`app/domain/customer.py`) is a flat entity — `dni` (unique), `name`, optional
  `email`/`phone` — with full CRUD via the generic `CrudService` pattern, plus `GET /customers?q=`
  (case-insensitive substring match on `dni` OR `name`, `CustomerRepository.list_all(q)`) backing
  the checkout search box. `IntegrityError` on a duplicate `dni` is translated to
  `BusinessRuleViolationError` in `CustomerService.create`/`update`, same pattern as
  `StockService.create`. A `Sale` optionally carries `customer_id` (nullable FK, validated with
  `EntityNotFoundError` if set but unknown) — attaching a customer is entirely optional at checkout,
  never required to confirm a sale.
  - **`dni` is locked after creation** — same "renaming would make history misleading" reasoning as
    Category/Brand/Color/Size (see below), but enforced differently since `name`/`email`/`phone`
    still need to stay editable: `CustomerService.update` raises `BusinessRuleViolationError` if
    `payload.dni != existing.dni`, rather than dropping the field from the schema entirely (`PUT`
    still accepts a `dni`, the service just rejects a *changed* one). Frontend:
    `SimpleCatalogPage.tsx`'s `Field<TInput>` gained a `disabledOnEdit?: boolean` flag (render the
    input `disabled` once `editingId !== null`) — `CustomersPage.tsx` sets it on `dni` only.
  - `CustomerPicker.tsx`'s checkout search box always shows a "Crear cliente" button next to the
    result list (not just when there are zero matches) — a real customer can share a name/partial
    dni with someone new, and the cashier must always be able to fall through to creating a new
    record instead of being forced to pick an existing one. Its quick-create form also gained
    optional `email`/`phone` inputs, mirroring the catalog page.
- **Promotion** (`app/domain/promotion.py` + `app/domain/promotion_item.py`) is a parent/children
  entity, not a flat row: `Promotion` only holds `name`/`start_date`/`end_date`/`active`
  (`end_date: date | None` — a promotion can have no end date, meaning it never expires; the
  frontend's "Hasta" input is simply left blank, `end_date: endDate || null` in the payload, and
  `PromotionRepository.list_active` matches with `or_(end_date.is_(None), end_date >= on_date)`),
  and every
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
  which finds every active promotion whose lines are fully satisfied by the cart (a `category_id`
  line matches the first cart product in that category, in cart order, with enough remaining
  quantity), clusters competing promotions by shared matched products (union-find), and within
  each cluster searches for the **combination of repeat counts across those candidates that
  maximizes total discount** without exceeding the cart's available quantity for any shared
  product — not just a single "winner" per cluster (see the optimizer description below).
  Promotions in disjoint clusters (no shared product) all win simultaneously, each at their own
  maximal repeat count. Each winning line's discount is written onto the covering `SaleItem`(s)'
  `promotion_id`; items not covered by any winner keep `promotion_id = None`. The resulting
  `Sale.promotion_discount` is server-computed only (never accepted from `SaleCreate`) and is
  subtracted from the total alongside the manual `discount` (which can now carry an optional
  `discount_reason` string, e.g. "cliente frecuente" — also server-trusted, just persisted as-is).

  `PromotionService._collect_satisfied_candidates` repeats a **2+ line** promotion's discount as
  many times as the cart holds complete sets: `max_repeat = min(cart_qty // line.min_quantity)`
  across all its lines, and each line's discounted quantity per repeat is `min(line.min_quantity,
  line.max_quantity)` if capped, else `line.min_quantity`. So a "1 shirt + 1 shorts" combo with 2
  of each in the cart can repeat twice, discounting both pairs; with 2 shirts + 1 shorts it can
  only repeat once, leaving the second shirt full price (unless a *different* promotion in the
  same cluster claims it — see below). A **single-line** promotion is deliberately exempt from
  this repeat-unit model (`max_repeat = 1`, an all-or-nothing binary choice) — there `min_quantity`
  is just a threshold gate ("10% off if you buy 3+"), not a combo unit, so it still discounts every
  matching cart unit in one shot rather than only multiples of `min_quantity`. This distinction is
  load-bearing; do not merge the two code paths without re-checking `tests/test_sale_service.py`'s
  threshold-vs-combo tests.

  **Cluster optimizer** (`_CandidateTemplate`/`_optimize_cluster` in `promotion_service.py`): fixes
  a real bug found in manual testing where, e.g., a "$4000 off Short+Remera" promo and a "$4500 off
  Short+Remera+Medias" promo both matching a cart of 2 Short + 2 Remera + 1 Media used to pick only
  the single higher-`total_discount` candidate (the $4000 one, since it could repeat twice for
  $8000) and discard the other entirely — even though applying the $4500 combo once (consuming 1 of
  each) *and* the $4000 combo once on the leftover 1 Short + 1 Remera ($8500 total) is strictly
  better. Each candidate is now built as a `_CandidateTemplate` exposing its **per-repeat** unit
  economics (`per_repeat_consumption`: how much of each shared product one repeat reserves from the
  cart; `per_repeat_discount_quantity`/`per_repeat_discount`: how much gets discounted and for how
  many dollars, one repeat's worth, already quantized to the cent so multiplying by an integer
  count stays exact) instead of one repeat count already baked in. `_optimize_cluster` then runs a
  bounded backtracking search over every candidate's repeat count (0..`max_repeat`) per cluster,
  maximizing total discount subject to not exceeding any shared product's cart quantity — falling
  back to the old single-winner-by-`total_discount` behavior (`_greedy_single_winner`) if a
  cluster's search space exceeds `_MAX_SEARCH_SPACE` (100,000 combinations), logging a warning
  rather than risking a slow request; this should never trigger for a realistic POS's promotion
  count. **Known cosmetic limitation**: `SaleService.create_sale`'s per-`SaleItem` `promotion_id`
  tagging loop assumes one promotion per product — when two different promotions from the
  optimizer both cover part of the same product's `SaleItem` quantity, the item ends up tagged with
  whichever promotion's `PromotionApplication` was processed last (sorted by `promotion_id`), not a
  blend of both. The **total discount amount is always correct** regardless (summed directly from
  `PromotionApplication.discount_amount`, independent of the tagging loop) — only the "promo" badge
  shown per cart/sale line can be incomplete in this specific multi-promotion-per-product scenario.
  Not fixed this round since it would need `SaleItem` to support more than one `promotion_id` per
  line, a bigger schema change; see `tests/test_sale_service.py::
  test_create_sale_applies_optimal_combination_of_overlapping_promotions` for the exact behavior.

  "Combo at a target final price" (e.g. shirt $15 + shorts $12 → combo price $25) is a **frontend-
  only** feature in `PromotionsPage.tsx` — the backend schema never changed. Given a final price and
  a distribution mode (proportional to each product's current price, or split in equal-dollar
  shares across lines), the UI's `distributeDiscount` helper computes each line's dollar share of
  the total discount, rounds every line but the last to the cent, and has the **last line absorb
  the exact rounding remainder** so the shares always sum to precisely `totalOriginal - targetPrice`
  — every line is always submitted as `discount_type: 'fixed_amount'` in this mode (never
  `'percentage'`), even in the "proportional" distribution, specifically because a fixed dollar
  amount reproduces exactly through the backend's `compute_line_discount` (no re-quantization
  against a percentage rate at sale time the way the old single-shared-rate percentage math did).
  This fixed a real bug found in manual testing where a $73,000 target combo actually charged
  $72,997.95 at sale time — three compounding rounding steps (the frontend's old single-rate
  percentage math, the `Numeric(12,2)` DB column, and the backend's per-line quantization against
  the *live* sale-time price) never guaranteed the parts summed back to the whole. The one
  remaining, accepted source of drift: if a product's price changes between promotion creation and
  the actual sale, the fixed dollar amounts no longer reflect the *current* price ratio — this
  matches the existing "computed once in the frontend" design already accepted elsewhere in this
  feature. It's only offered when every line targets a `product_id` (not `category_id`), since a
  category line's actual matched product — and thus its reference price — isn't known until sale
  time.
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

## Audit trail (traceability)

`AuditLog` (`app/domain/audit_log.py`, table `audit_logs`) is an append-only entity (`create` +
filtered `list_all` only, no update/delete — same shape as `Sale`/`Purchase`) recording who did
what, when, and in which branch. `actor_username` is denormalized onto the row itself (not just
`actor_user_id`, which has **no FK constraint** on purpose) so history still reads correctly after a
user is deleted, and so the test fixtures' synthetic, never-persisted `User(id=1, ...)` (see the
Authentication test-fixture note above) doesn't trip a foreign-key violation on every write.

- `AuditLogService.record(actor, action, entity_type, entity_id, branch_id=..., summary=...)`
  (`app/services/audit_log_service.py`) is called by other services *after* their own mutation
  succeeds, sharing the same session (`flush`, not `commit`) so the audit entry is atomic with the
  operation it documents.
- **Covered generically via the base class**: `CrudService.create`/`update`/`delete`
  (`app/services/base_service.py`) accept an optional `audit: AuditLogService | None` (constructor)
  and `acting_user: User | None` (per-call, keyword-only) — if both are present, they log
  automatically. Every subclass's overridden `create`/`update`/`delete` just needs to forward
  `acting_user=acting_user` to `super().xxx(...)`. **Only wired into `CustomerService` and
  `StockService` so far** (see next point) — the other `CrudService` subclasses (Category, Brand,
  Color, Size, Branch, PaymentMethod, Product, Promotion, Expense) don't pass an `AuditLogService`
  into their `get_<entity>_service` factory yet, so no audit rows are recorded for them today. Wiring
  one in is a small, mechanical, non-breaking change (the plumbing already exists) — do it if asked.
- **Services with their own mutation logic get an explicit `record(...)` call at the point of
  success**, each with its own `acting_user: User | None = None` kwarg (same non-breaking,
  keyword-only shape as `acting_branch_id`): `SaleService.create_sale`/`cancel_sale`,
  `PurchaseService.create_purchase`/`cancel_purchase`/`mark_paid`,
  `ExchangeService.create_exchange`/`cancel_exchange`, `UserService.create`/`update`/`delete`.
  `StockService.increase_quantity`/`decrease_quantity` only logs when `acting_user is not None` —
  the *manual* adjustment route (`/stocks/{id}/increase`/`/decrease`) passes it, but `SaleService`/
  `PurchaseService`/`ExchangeService`'s own internal stock adjustments (decrementing/incrementing as
  a side effect of a sale/purchase/exchange) never do, so a single sale line-item doesn't spam the
  log with a redundant `stock.decrease` entry alongside its own `sale.create` entry. This closes the
  "No audit trail for manual stock +/-" limitation that was explicitly deferred until a login/user
  system existed (see previous Known Limitations revisions).
- `GET /audit-logs?start_date=&end_date=&branch_id=&action=&actor_user_id=` (`audit_log_route.py`,
  admin-only via router-level `Depends(require_admin)`) — filters are applied at the SQL level in
  `AuditLogRepository.list_all` (not in-memory like `ReportService`), since this table can grow
  faster than the others. Frontend: `AuditLogPage.tsx` (`/catalogo/trazabilidad`, admin-only) —
  date range + branch + a "solo cancelaciones" filter (client-side, over the already-fetched list) —
  action codes are translated to Spanish via a local `ACTION_LABELS` map, falling back to the raw
  code for anything not in it (so adding a new `record(...)` call elsewhere doesn't require touching
  this map to avoid a broken UI, just to avoid an untranslated label).

## Financial dashboard

`ReportService.financial_summary(start_date, end_date, branch_id=None)` (`app/services/
report_service.py`, same file/repos as `daily_cash_balance`) generalizes that report from one
calendar day/one branch to an arbitrary date range and optionally every branch at once
(`branch_id=None`) — same "compose everything in memory" approach, same justification (acceptable
at a single POS's data volume). Returns a `FinancialSummary` (`app/domain/financial_summary.py`):
`sales_total`/`purchases_total`/`expenses_total`/`net_cash_balance` (cash-only, same formula as
`daily_cash_balance.balance` but summed over the range), a `payment_method_breakdown` list (per
**actual** `PaymentMethod`, not just cash/not-cash — sales/purchases/expenses/exchanges amounts by
method, answering "how much in cash, how much on each card"), and a `daily_series` for charting
(reuses `_to_art_date`). **Deliberately doesn't include raw drill-down rows** — the frontend re-uses
the existing `GET /sales`/`/purchases`/`/expenses`/`/exchanges` endpoints and filters the
already-loaded lists client-side by the same date range, the same pattern `SalesHistoryPage.tsx`
already uses, instead of duplicating that data over the wire.

`GET /reports/financial-summary?start_date=&end_date=&branch_id=` (new `report_route.py`,
admin-only) — a separate router from `daily-balance` (which stays nested under `/branches/{id}/...`
since it's always branch-scoped) because this endpoint's `branch_id` is optional.

Frontend: `FinanceDashboardPage.tsx` (`/finanzas`, admin-only) — date range + branch filter, stat
cards, a payment-method bar chart, a daily line chart, and drill-down tabs (Ventas/Compras/Gastos/
Cambios) over the client-filtered lists described above. Charts use **`recharts`** (new dependency —
nothing charted anything before this). Two things worth knowing if you touch this page:
- **CSS custom properties work directly as recharts `fill`/`stroke` values** (`var(--border)`,
  `var(--muted-foreground)`, etc.) — the browser resolves them like any other CSS color, so the
  chart re-themes for free on a light/dark toggle with no JS re-render logic. Verified: the resolved
  `fill` on an axis-tick `<text>` element changes from the light `--muted-foreground` to the dark
  one automatically. The one thing CSS vars *can't* fix is recharts' hardcoded white-background
  Tooltip — that needs an explicit `contentStyle`/`labelStyle`/`itemStyle` (see `chartTooltipStyle`
  in `FinanceDashboardPage.tsx`) pointing at `var(--popover)`/`var(--popover-foreground)`, or it
  renders a white box with black text regardless of theme.
- The actual bar/line **series colors** (as opposed to grid/axis/tooltip chrome) are explicit hex
  pairs per theme (`CHART_COLORS.light`/`.dark` in the same file, read via `useTheme()`) rather than
  CSS vars — the theme's own `--chart-1..5` tokens are pure grayscale in both light and dark (never
  customized beyond the shadcn default), so they'd produce an indistinguishable monochrome chart;
  hand-picked emerald/rose/amber were used instead, matching the emerald-for-positive-amounts
  convention already used elsewhere (`CartPanel.tsx`'s promotion-discount line).

## Sale confirmation and PDF receipt

Confirming a sale is now a two-step dialog flow in `SalePage.tsx`, not a single button press:
"Confirmar venta" opens an `AlertDialog` showing the total and asking to confirm; only *that*
dialog's "Confirmar" actually calls `createSaleMutation`. On success, a second `AlertDialog` asks
whether to download a PDF receipt — the receipt's line-item/customer data is snapshotted from the
cart's `lines`/`preview`/`selectedCustomer` state **before** `clear()` empties the cart, since
there's no other cheap way to re-fetch "what was just sold" after the store resets. Same pattern in
`ExchangeForm.tsx` for a Cambio/Devolución — the receipt-prompt `AlertDialog` calls the shared
`onSuccess` callback (which the parent uses to close/reset) only once the receipt dialog itself is
dismissed, not immediately after the mutation succeeds, since the parent closing/unmounting the form
right away would take the receipt prompt down with it before the cashier ever saw it.

`frontend/src/lib/receipt.ts` (new **`jspdf`** dependency — chosen for being client-side, no backend
round-trip and no new Python PDF library, and for staying light: `html2canvas`/`dompurify`, which
`jspdf` pulls in for its unused `.html()` rendering API, end up in separate lazy-loaded chunks that
are never fetched since this code only uses `jsPDF`'s plain text/line drawing) builds an
**80mm-wide ticket-style** receipt, not an A4 invoice: monospace (`courier`) font, dashed-line
separators, itemized product/variant/qty/unit-price/subtotal lines, subtotal/discount/promotion-
discount/total, and a footer noting "Este comprobante no es una factura" (it's explicitly a
proof-of-purchase, not a fiscal invoice). A shared `Ticket` class renders the same content column
on any of three `ReceiptFormat`s: `'thermal'` (80mm-wide, on its own roll, height computed from the
item count so there's no wasted paper), `'a4'` (same 80mm column, centered on a full A4 sheet — for
a shop without a thermal printer), or `'a6'` (uses the **entire** 105mm width of an A6 sheet, and is
capped at its 148mm height — unlike thermal, it never grows past the page: if the estimated content
doesn't fit, `Ticket`'s `lineStep` shrinks proportionally, down to a `MIN_LINE_STEP_MM` floor,
instead of overflowing). `Ticket.width`/`Ticket.lineStep` are per-format (not the old hardcoded
`CONTENT_WIDTH_MM`/`4.2`), so `left()`/`right()`/`center()`/`dashLine()` all adapt automatically.
Both `buildReceiptPdf` (Sale) and `buildExchangeReceiptPdf` (Cambio/Devolución, `A PAGAR`/
`A REINTEGRAR` instead of a flat total, sign-prefixed returned-item lines) share this `Ticket`
helper; `downloadReceiptPdf`/`downloadExchangeReceiptPdf` trigger the browser's native file-save
directly — no server involvement, no temp file.

- **Item variant reads "Talle L"/"Color Rojo", not a bare "L"** — `SaleCatalogEntry`/`StockOption`
  (`useSaleCatalog.ts`/`useStockOptions.ts`) now expose `colorName`/`sizeLabel` separately (not just
  the pre-joined `variantLabel` used for on-screen picker/dropdown display), and
  `formatVariantForReceipt(colorName, sizeLabel)` in `lib/receipt.ts` prefixes each part before it
  ever reaches a receipt — fixes a real bug found in manual testing where a size label alone (e.g.
  "3") read like a quantity on the printed ticket. `cartStore.CartLine` carries `colorName`/
  `sizeLabel` through from `ProductPicker.tsx`'s `addVariant` for this reason.
- **No sale/exchange number is printed on the receipt at all** (per explicit feedback — a customer
  shouldn't see an internal id) — `buildReceiptPdf`'s header stops at Fecha → Hora → Total →
  Cliente, and `buildExchangeReceiptPdf` dropped its "Venta original #N" row too (it kept "Cambio
  #Y" — that identifies the comprobante itself, not "the sale number"). The PDF filename (see below)
  still embeds the sale id, since that's for the shop's own filesystem, not something the customer
  reads.
- **No "Recargo" line — every printed unit price is already the card-inclusive "list price"**
  (per explicit feedback: the word "Recargo" itself is not allowed to appear). `buildReceiptPdf`
  computes `ratio = grossTotal(payments, total) / total` (gross paid ÷ net sale total) and, when
  `ratio !== 1`, reprices every item's `unitPrice` plus `subtotal`/`promotionDiscount`/`discount` by
  that same ratio (`applySurchargeToLinePrices`) before printing — so a $10 shirt paid with a
  10%-surcharge card prints as $11, and every line still sums exactly to the printed `TOTAL`. No
  separate surcharge row exists anymore. `ProductPicker.tsx`'s surcharge-aware total logic itself is
  unchanged; only how the receipt *displays* it changed.
- **Ítem name wraps to 2 lines instead of being truncated with `…`** — `Ticket.itemLine` used to
  hard-truncate a long product name to 40 characters on one line; it now uses
  `doc.splitTextToSize(...)` to wrap up to 2 real lines (ellipsis only on the 2nd line if a 3rd would
  be needed), sized to the ticket's actual content width so it also adapts to the A6 format. The
  height estimate used to size a thermal ticket accounts for this (3 lines worth of space per item,
  not 2), so wrapping never pushes text past the bottom of the page.
- **Filename is `fecha-hora-monto-cliente-nrodeventa.pdf`**, not `recibo-venta-{id}.pdf` — built by
  `filenameDateTime()`/`slugify()` in `receipt.ts`. This is purely the *downloaded file's* name
  (what the shop sees in its Descargas folder); it doesn't affect anything printed on the ticket
  itself.
- **Reimprimir recibo**: `SaleDetailPanel.tsx` can regenerate a sale's receipt (any of the 3
  formats) after the fact — `buildReceiptInput()` reconstructs a `ReceiptInput` from the already-
  loaded `useSale(id)`/`useStockOptions()`/`usePaymentMethods()`/`useCustomer()` data, the same shape
  `SalePage.tsx`'s post-sale flow builds from local cart state. **Every numeric field pulled from
  the API is wrapped in `Number(...)`** (`unit_price`, `subtotal`, `discount`, `promotion_discount`,
  `total`, `amount_with_surcharge`) — see the "Decimal fields are JSON strings" gotcha below for why
  that's required here specifically (this is the one receipt-building path that reads straight from
  API responses instead of live local component state).
- **Gotcha: API `Decimal` fields are JSON *strings*, not numbers — summing them with bare `+` breaks
  silently.** FastAPI/Pydantic serialize `Decimal` to a JSON string (`"52000.00"`, not `52000`) to
  avoid float precision loss. Multiplication/division auto-coerce a numeric string fine (`"3" * 2 ===
  6`), which is why most of this codebase's money math "just works" without anyone converting
  explicitly — but `+` does **not**: if either operand is a string, `+` concatenates instead of
  adding. This is a real bug found via manual QA: any Cambio/Devolución with ≥1 payment showed
  **"$ NaN"** in `SalesHistoryPage.tsx`'s daily breakdown (`ExchangeCashRow`'s
  `payments.reduce((sum, p) => sum + p.amount, 0)`) and, in `ExchangeDetailPanel.tsx`, silently
  turned `waived` into `NaN` — which then *always* rendered a bogus "No reembolsado: $NaN" row, even
  on a fully-paid exchange, since `NaN !== 0` is always true. Both now do
  `sum + Number(payment.amount)`; `lib/receipt.ts`'s `grossTotal()` was hardened the same way as a
  shared defensive fix. **Watch for this pattern (`sum + apiField`) anywhere new money math is
  added** — it's silent (no exception, no console error) until you look at the rendered number.
- **`ProductPicker.tsx` shows the variant on the card when only one is left in stock** — previously
  a product's card only showed "N variantes disponibles" when there was more than one; with exactly
  one remaining stock row, nothing hinted which variant that was until it landed in the cart. Now
  the single variant's label (plus its color swatch, if any) renders directly under the product name.

## Price tag generator

`generador_carteles/` (repo root) is a **standalone, unrelated** Python/reportlab CLI script built
for one specific past client — console-driven, hardcoded branding, not read from this system at
all. `/carteles` (visible to **both roles**, not admin-only — a cashier should be able to print a
tag without needing an admin around) is the in-app equivalent: pick products **already loaded with
a price** in this POS, set a copy count (and an optional free-text "detalle") per product, choose a
sheet layout, and get a PDF — using *this* system's logo/company name, not a hardcoded one.

- `frontend/src/lib/priceTags.ts` (client-side `jsPDF`, same no-backend approach as `receipt.ts`)
  ports the reference script's text-fit algorithm (`_armar_lineas`/`_partir_por_caracteres` →
  `wrapLines`/`splitByChars`/`fitText`: shrink-the-font-until-it-fits, falling back to splitting a
  single too-wide word character-by-character only as a last resort) and its 4 sheet layouts (1/2/4/16
  tags per A4 sheet, chosen by rows×cols) to TypeScript, generalized to use the app's own branding
  instead of one hardcoded company.
- **Reuses the Poppins `.ttf` files already sitting in `generador_carteles/fuentes/`** (bundled,
  libre-licensed) — copied to `frontend/public/fonts/`, fetched and registered into jsPDF at
  generation time via `addFileToVFS`/`addFont`, falling back to Helvetica if that fails for any
  reason (offline, blocked request) — same never-break-the-generator philosophy the source script
  already had for its own font fallback.
- **Logo**: rasterized onto an off-screen `<canvas>` and embedded as a PNG (`jsPDF.addImage` can't
  place an SVG directly) — resolves to `null`, and is skipped, on any load/draw failure, the same
  graceful-degradation convention used for product images elsewhere (`onError` hides broken `<img>`s).
- **Color**: `PriceTagsInput.primaryColor` (defaults to `brandConfig.colors.light.primary`, but
  `PriceTagsPage.tsx` passes `brand?.colors?.light?.primary` when the admin has configured one —
  see "Brand colors" below) is resolved to an RGB triplet via `resolveColorRgb()` in the shared
  `frontend/src/lib/color.ts` (moved there from this file so `ThemeProvider`/`BrandSettingsPage`
  could reuse it too). Always the **light** palette regardless of the shop's current UI theme, since
  a printed tag should look the same either way. **Gotcha found the hard way**: `resolveColorRgb`
  used to read `getComputedStyle(probe).color` on a throwaway element — that trick silently broke on
  newer Chromium, which echoes an `oklch(...)` input straight back out as `oklch(...)` instead of
  normalizing it to `rgb(...)`, and the old regex-based parser then read `oklch(1 0 0)` (white) as
  `rgb(1, 0, 0)` (near-black-red). Fixed by painting the color onto a real 1×1 `<canvas>` and reading
  back the actual rendered pixel bytes via `getImageData()` instead — canvas always rasterizes to
  concrete sRGB, regardless of how `getComputedStyle` chooses to serialize the color.
- **Descuento de promoción en el cartel**: `PriceTagItem.originalPrice` (optional) — when set and
  greater than `price`, `drawTag` renders it struck through (a manually-drawn line across the
  measured text width, since jsPDF has no `text-decoration`) just above the final price, in both the
  vertical and horizontal tag layouts. `PriceTagsPage.tsx` resolves which promotions apply to a
  product via `useQueries` fetching every active promotion's detail in parallel (`usePromotions()`
  only returns the list, not `items[]` — same list/detail split `usePromotion(id)` already has;
  `useQueries` shares its `['promotions', id]` cache key so it doesn't duplicate fetches). A
  `Select` per row lets the cashier pick "Sin promoción" or one of the matching `PromotionItemRead`
  candidates (matched by `product_id`, or `category_id` against the product's own category);
  `applyDiscount()` computes the discounted price the same way the backend's promotion math does
  (percentage or fixed amount, floored at 0).
- **Carteles manuales**: a cartel doesn't have to come from the product catalog — `PriceTagsPage.tsx`
  has a second, separate mini-form ("Carteles manuales") for a free-text name + price + copies +
  detail, for anything not worth loading as a real `Product` just to print a tag for it (a display
  sample, a one-off). These `ManualItem`s get merged into the same `PriceTagItem[]` passed to
  `buildPriceTagsPdf` as the catalog selections, right before generating.
- **Precio sin centavos en el cartel**: `formatCurrencyNoCents()` (`lib/format.ts`, a second
  `Intl.NumberFormat` instance with `maximumFractionDigits: 0`) is used only for the price text drawn
  onto a tag — a printed "$10.000,00" reads as clutter at a glance. Receipts and every other money
  display in the app keep using `formatCurrency()` (with cents) unchanged.
- **Gotcha found the hard way: `jsPDF.setFontSize()` always takes points, never the document's own
  unit.** Every measurement in this file is otherwise in millimeters (matching `receipt.ts`'s
  convention), so the very first version of this feature fed mm-scale numbers straight into
  `setFontSize()` — text rendered ~2.8x smaller than intended, with the sheet mostly blank
  (reported as "the text is tiny, we're not using the space"). Fixed by converting to points
  (`MM_TO_PT = 2.8346456693`) at exactly the two points that call into jsPDF's font APIs
  (`textWidth()`, `setFontSizeMm()`) — every other calculation (positions, wrap widths, margins)
  stays in mm untouched. Watch for this same trap in any future jsPDF-based feature: `getTextWidth()`
  returns a value in the *document's* unit, but `setFontSize()` never does.
- `frontend/src/modules/pricetags/PriceTagsPage.tsx` — a table over `useProducts()` (name filter,
  same substring pattern as `ProductPicker.tsx`) with an inline "Cantidad", "Detalle", and
  "Promoción" (see above) input per row, plus a separate "Carteles manuales" mini-table for
  non-catalog entries; the detail text and manual entries are ephemeral UI state only, never
  persisted (`Product` gains no new field). A running "N carteles — M hojas A4" summary mirrors the
  source script's own console summary before generating.

## Payment-method price preview

`frontend/src/components/PricingDisplaySelector.tsx` — a payment-method `Select` shown in both
`ProductPicker.tsx` (the sale screen) and `ProductsPage.tsx` (the catalog), letting an employee
pick a payment method (e.g. a card with a surcharge) and see every product's price already
recalculated with that method's `surcharge_percentage`, instead of doing the math by hand at
checkout — a real request from the first client after testing the system in production.
**Display-only, on purpose**: the selection never touches `cartStore`/`addLine`/checkout math —
`ProductPicker.tsx`'s `addVariant` still sources `unitPrice` straight from
`SaleCatalogEntry.unitPrice`, completely independent of this preview.

- `frontend/src/stores/pricingDisplayStore.ts` — a small Zustand store, separate from
  `authStore.ts` on purpose (different lifecycle: this must *not* reset on logout, unlike auth
  state), using the same `persist` middleware pattern (own localStorage key,
  `pos-pricing-display`) so the cashier picks a method once and it stays applied across both
  screens and across page reloads — explicitly requested over two independent per-page selectors.
- `frontend/src/lib/pricingDisplay.ts` — `resolveDisplayPrice(basePrice, selectedPaymentMethodId,
  methods)` (wraps the existing `applySurcharge` from `lib/payment.ts`; a dangling persisted id —
  a method deleted after being selected — silently falls back to the base price, no error state)
  and `priceColorClass(method)`, which colors the displayed price amber
  (`text-amber-600 dark:text-amber-400`) once a surcharge > 0 is actually applied, or emerald
  (`text-emerald-600 dark:text-emerald-400`) for list price / a 0%-surcharge method — reusing the
  exact amber/emerald "differs from base" vs. "ok" convention `PaymentPanel.tsx` already
  established for its own remaining-balance indicator, per explicit user request for a fast visual
  cue distinguishing recargo vs. no-recargo prices.
- Both `ProductPicker.tsx` (card price) and `ProductsPage.tsx` (grid card price + the list view's
  "Precio" table column) swap their `formatCurrency(...)` call for the resolved
  price/color — the `Costo` column and the create/edit product form keep showing/editing the raw
  base price unchanged, since that's the actual stored value.

## Public storefront (WhatsApp catalog)

`storefront/` is a **second, separate** React/Vite app (not a page inside `frontend/`) — a
read-only, unauthenticated product catalog for customers, deliberately dependency-light (no
radix-ui, react-hook-form, zod, recharts, or jsPDF — see `storefront/package.json`; it does use
`zustand` and, as of the redesign below, `react-router-dom`) since it has no admin features to
support and should load fast. It has no checkout: adding to a cart and confirming hands off to a
`wa.me` WhatsApp deep link with a prefilled message listing the whole cart; the actual order/
payment/delivery is negotiated over that chat, nothing is submitted back to this app. Chosen over
a Tienda Nube integration after discussing both — the client only wants "catalog + WhatsApp" for
now, which is strictly simpler to build/own than an external platform integration.

- **Backend**: `app/routes/storefront_route.py` (`GET /storefront/products`, wired into
  `api_router.py` with no `Depends(get_current_user)` — entirely public, same as
  `brand_settings_router`'s `GET`) is backed by `StorefrontService`
  (`app/services/storefront_service.py`), which composes Product + Stock + Category + Color + Size
  + `ProductImage` **in memory**, same "acceptable at this scale" pattern as `ReportService`. Stock
  is **summed across every branch** rather than scoped to one "online" branch — unlike a real
  checkout, there's no oversell risk here (no stock is ever decremented by a storefront view), so
  the extra configuration a single online branch would require isn't worth it. A product with zero
  stock anywhere still appears (`in_stock: false`) rather than being hidden, so the storefront can
  still advertise it with a "Consultar disponibilidad" wording instead of "Pedir por WhatsApp".
  `StorefrontProductRead.gallery_urls` (each product's extra `ProductImage` photos, beyond the cover
  `image_url`) rides along in the same list response — no separate per-product endpoint — for the
  product page's thumbnail strip (see below).
- **WhatsApp number**: `BrandSettings.whatsapp_number` (nullable `str`, digits only, no `+` —
  interpolated directly into a `wa.me/<number>` link) is editable from the admin's existing
  Configuración page (`BrandSettingsPage.tsx`), reusing the same singleton-settings entity as the
  logo/company-name/colors rather than inventing a separate settings concept. `GET /brand-settings`
  already had no auth dependency (see BrandSettings above), so the storefront reads it the same way
  the admin login page reads the logo — no new public endpoint needed for this.
- **Hero carousel images**: `BrandSettings.hero_images` (nullable `list[str]`, a plain JSON array
  of media URLs — same "presentation data" shape/reasoning as `colors`) is admin-managed from a new
  section in `BrandSettingsPage.tsx`: upload (reusing `uploadProductImage()`, no crop step — unlike
  the logo, hero banners are wide/arbitrary aspect ratio by nature), reorder (up/down buttons
  swapping array positions), remove, all built as local array state and saved together on
  "Guardar" — same pattern the color editors already use. `BrandSettingsService.update` diffs the
  previous vs. new list and `delete_media_file()`s anything removed, same cleanup convention as the
  logo replacement. `storefront/src/components/HeroCarousel.tsx` (hand-rolled, no carousel library)
  renders them on the home page: a `flex` track translated via `translateX`, auto-advancing every
  5s (`setInterval`, reset on manual navigation, paused on hover), with prev/next arrows and dot
  indicators; renders nothing with zero images, a single static `<img>` with exactly one.
- **Branding parity, without pulling in the admin's theme system**: `storefront/src/theme/
  useBrandTheme.ts` re-implements just the CSS-custom-property application half of the admin's
  `ThemeProvider.tsx`/`applyTheme` (same 14 tokens, same "DB override wins token-by-token over the
  factory oklch() defaults" behavior) — copied rather than shared as a package, since these are two
  independent Vite apps with no shared build step. Unlike the admin, there's no manual light/dark
  toggle here; it just follows the OS `prefers-color-scheme`, since a public catalog has no
  persisted-per-user theme preference to store. `storefront/src/index.css` mirrors only the CSS
  variable tokens the storefront actually uses (no sidebar/chart tokens) from the admin's
  `index.css` — kept in sync by hand, there's no build-time link between the two files.
- **Real routes via `react-router-dom`**: the product detail view is a full page
  (`/producto/:id`, `storefront/src/pages/ProductPage.tsx`), not a modal — added specifically so it
  has a linkable/reloadable URL. `storefront/src/components/Layout.tsx` (logo/search/cart navbar +
  `<Outlet/>` + the cart sidebar, all persistent across navigation) wraps `/` (`pages/HomePage.tsx`)
  and `/producto/:id` in `App.tsx`'s `<Routes>`; `main.tsx` wraps the whole tree in `BrowserRouter`.
  `storefront/nginx.conf`'s SPA `try_files ... /index.html` fallback already covered this in
  production; `ProductPage` finds its product from the same cached `useStorefrontProducts()` query
  the home page uses (via `useParams`), so navigating from the grid needs no extra fetch — a direct
  deep link just waits for that one shared query. `HomePage.tsx` keeps `search`/`category` in the
  URL (`useSearchParams`) instead of local state, so a filtered view is itself a shareable link.
- **One navbar, not a stacked header + search bar**: `storefront/src/components/Navbar.tsx` —
  logo (left), a centered search input, cart icon + item-count badge (right). Typing in the search
  box updates the `q` URL param live if already on `/`, or navigates to `/?q=...` from any other
  page (e.g. the product page) — search is reachable everywhere, filtering only happens on
  `HomePage`. `storefront/src/components/CategoryFilter.tsx` (the chip row) is `HomePage`-only,
  rendered below the hero, reading/writing the `category` URL param the same way.
- **Cart is a right-side sliding sidebar, not a centered dialog**
  (`storefront/src/components/CartSidebar.tsx`, replacing the earlier `<dialog>`-based
  `CartDialog.tsx`) — a fixed backdrop `<div>` + `<aside>` pair, **always mounted** (so
  `translate-x-full ↔ translate-x-0` actually animates both ways) rather than conditionally
  rendered, hand-rolled (no radix `Dialog`, unlike the admin's `Sheet.tsx`) to stay
  dependency-light. Its open/closed state lives in `storefront/src/stores/cartUiStore.ts` — a
  **separate, non-`persist`ed** zustand store from `cartStore.ts` (the actual line items), since
  "is the drawer open" is ephemeral UI state with no reason to survive a reload; keeping it
  separate also means any page (e.g. `ProductPage`, several route levels away from the navbar) can
  call `cartUiStore.getState().open()` without prop-drilling through `<Outlet/>`.
  `storefront/src/stores/cartStore.ts` itself is unchanged from the first pass: a `zustand` +
  `persist` store (own localStorage key `storefront-cart`) holding `CartLine[]` (`key` =
  `` `${productId}:${stockId ?? 'none'}` ``, so the same product in two variants is two lines).
- **Adding to cart applies the same promotions the POS does, computed server-side**:
  `POST /storefront/cart/preview` (`app/schemas/storefront_schema.py`'s `CartPreviewRequest`/
  `CartPreviewResponse`, `StorefrontService.preview_cart`) calls the exact same
  `PromotionService.select_winning_applications` engine `SaleService.compute_totals` uses for a
  real sale — that method only ever needs `{product_id: quantity}`/`{product_id: category_id}`/
  `{product_id: unit_price}` dicts and today's date, so unlike a POS sale (which resolves
  `stock_id → Stock → Product`), the storefront cart (already keyed by `product_id`) calls it
  directly with **no Stock/branch involved at all** — no promotion logic is duplicated. Any
  `product_id` that no longer exists, or is `hidden_from_storefront`/`price_hidden_from_storefront`,
  is silently skipped server-side too (never just trusting the frontend to have excluded it — a
  price-hidden product's price must never leak into a computed total). `storefront/src/hooks/
  useCartPreview.ts` calls this (aggregating cart lines by `productId` first, and never sending
  price-hidden lines) with `staleTime`/no retry, and `CartSidebar.tsx` falls back to a naive
  client-side sum if the request errors — checkout is never blocked on this endpoint being up. The
  sidebar footer shows Subtotal → one green line per `applied_promotions` entry → Total, and
  `lib/whatsapp.ts`'s `buildCartWhatsAppUrl` includes the same discount line(s) and the real
  (discounted) total in the prefilled message.
- **Product page layout** (`pages/ProductPage.tsx`, replacing the deleted `ProductDetailDialog.tsx`
  modal): two columns (stacks on mobile) — large image + a thumbnail strip built from
  `[image_url, ...gallery_urls]` (click to swap the main image) on the left; category eyebrow,
  name, price/"Consultar precio", `description` rendered with `whitespace-pre-wrap` (so an admin's
  multi-line/dashed description reads like a spec list, no separate "specs" field needed), the
  variant-chip picker, a quantity stepper, and "Agregar al carrito" on the right. Adding to cart
  calls `cartUiStore.open()` (opens the sidebar) instead of closing a dialog.
- **Hiding a product, or just its price, from the storefront**: `Product.hidden_from_storefront`/
  `Product.price_hidden_from_storefront` (both `bool`, default `False` — see `app/domain/
  product.py`) are storefront-only display toggles, irrelevant to the POS itself (a hidden or
  price-hidden product still sells normally at the register, and its stock/sales are unaffected).
  Edited from the admin's existing product form (`ProductsPage.tsx`, two checkboxes) — no new page.
  `StorefrontService.list_products` drops a `hidden_from_storefront` product entirely and returns
  `price: None` for a `price_hidden_from_storefront` one; `StorefrontProductRead.price` is therefore
  `Decimal | None`. The frontend's `formatPriceOrConsult()` (`lib/format.ts`) renders `null` as
  "Consultar precio" everywhere a price would otherwise show, and both `buildCartWhatsAppUrl` and
  the cart-preview flow above exclude those lines from any computed total, calling them out
  separately ("+ precios a consultar") instead of silently treating them as $0.
- **Deployment**: mirrors `frontend/`'s exactly — `storefront/Dockerfile` (multi-stage, same
  `VITE_API_BASE_URL=/api` build arg) + `storefront/nginx.conf` (same `/api/`/`/media/` proxy to
  `backend`) + a `storefront` service in `docker-compose.prod.yml`, bound to its own host-only port
  (`STOREFRONT_PORT`, default 8091) — same "host Nginx terminates TLS and routes by subdomain"
  pattern as `DOMAIN`/`FRONTEND_PORT` (see Production deployment below), just optional per client
  until they actually want the public catalog live. `CORS_ORIGINS` in `docker-compose.prod.yml`
  includes `STOREFRONT_DOMAIN` for this reason. Local dev runs it as its own Vite dev server on
  port 5174 (`.claude/launch.json`'s `storefront` config; `app/core/config.py`'s `cors_origins`
  default list includes `http://localhost:5174` for this).
- **Full-width layout, manual light/dark toggle, search bypasses the hero**: after the first pass
  above, every page container's `max-w-6xl` was dropped in favor of `w-full px-4 sm:px-6 lg:px-8`
  (Navbar, HeroCarousel, CategoryFilter, HomePage's `<main>`, ProductPage) — the storefront now
  fills the full viewport width rather than sitting in a centered column, and `ProductGrid.tsx`'s
  columns were reduced (`sm:3 / lg:4 / xl:5` instead of maxing out at 5 from `sm` up) so cards read
  bigger at typical widths instead of just filling more columns. `storefront/src/theme/
  ThemeProvider.tsx` replaced the old OS-only `useBrandTheme.ts` hook — same CSS-variable
  application logic, but now wrapped in a context (`useTheme()`) so `Navbar.tsx` can render a
  sun/moon toggle button; the manual choice persists to `localStorage` (`storefront-theme`, its own
  key, independent of the admin's `pos-theme`) and wins over the OS preference from then on, same
  precedent as the admin app's own `ThemeProvider.tsx`. `HomePage.tsx` hides the `HeroCarousel`
  entirely while a search term is active (`isSearching`, derived from the `q` URL param) — a
  promotional banner isn't useful once the customer is already looking for something specific — and
  moved the section divider to sit right after the hero rather than right after the category chips,
  so the chips read as part of the products section below the line instead of belonging with the
  hero above it.
- **Gotcha: restarting the storefront's Vite dev server after adding a dependency mid-session.**
  Installing `react-router-dom` while `npm run dev` was already running left Vite's dependency
  pre-bundle cache (`node_modules/.vite`) stale, producing a duplicate-React runtime error
  ("Invalid hook call" / "useRoutes() may be used only in the context of a `<Router>`") despite the
  code itself being correct. Fix: stop the dev server, delete `storefront/node_modules/.vite`,
  restart. Watch for this same symptom any time a new dependency is added to either frontend while
  its dev server is already up.

## Database

PostgreSQL via `asyncpg`, but all access goes through SQLAlchemy — no raw SQL, no engine-specific
types outside migrations. `DATABASE_URL` (in `.env`, see `.env.example`) is the only thing that
changes to point at a different engine (e.g. `mysql+aiomysql://...`); no application code should
need to change. Alembic (`alembic/env.py`) imports every model module explicitly so
`Base.metadata` is fully populated before autogenerate runs — new model files must be added to
that import list (and to `tests/conftest.py`, which does the same for the in-memory test schema).
`tzdata` is a declared dependency purely because `app/services/report_service.py` uses stdlib
`zoneinfo.ZoneInfo("America/Argentina/Buenos_Aires")` for UTC→ART day-grouping (see the Timestamps
note above) — Windows doesn't ship IANA timezone data the way Linux/macOS do, so `zoneinfo` raises
`ZoneInfoNotFoundError` without this package installed; harmless no-op on platforms that already
have system tzdata.

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

Two more migrations, also applied: `182dfaa4e22c` (`exchanges.cancelled_at`, nullable, no backfill
— same shape as `sales.cancelled_at`) and `9a1161f0b67b` (`promotions.end_date` loosened to
nullable — pure relax-a-constraint, no backfill, same shape as the `products.category_id`/
`brand_id` change above).

Two more migrations, also applied: `0c235a9d5c3c` (new `users` table, `username` unique, `role` a
Postgres enum, nullable `branch_id` FK — and the **first** migration in this repo to seed data, a
raw `op.execute("INSERT INTO users ...")` for the bootstrap `admin`/`admin123` account with a
precomputed bcrypt hash pasted as a literal, since migrations don't import application code) and
`04537794570f` (new `brand_settings` table, no seed row — `BrandSettingsService.get()` falls back
to an in-code default when the table is empty instead).

Two more migrations, also applied: `812207fd43b4` (`customers.email`/`phone`, both nullable, no
backfill) and `3226fb5391c6` (new `audit_logs` table — `actor_user_id` is intentionally a plain
nullable int with **no FK** to `users.id`, see the Audit trail section above for why; `branch_id`
does keep a real `ondelete=SET NULL` FK to `branches.id`, since branch rows in this app are never
soft-deleted the way a synthetic test user can be unpersisted). An earlier draft of this migration
did add the `actor_user_id` FK, which immediately broke most of the test suite (every test using the
`client` fixture's fake `User(id=1, ...)` triggered a `BusinessRuleViolationError`-flavored
`IntegrityError` on the very first audited action, misreported by whichever caller's own broad
`except IntegrityError` happened to wrap it — e.g. `CustomerService.create` claimed "duplicate DNI"
for what was actually a foreign-key violation on the audit insert). If a future migration adds
another FK from a new table to `users.id`, make sure any code path that can fire before a real user
row exists (tests, seed scripts) either persists that user first or the FK stays nullable/absent.

One more migration, also applied: `9d3c1b4f7a2e` (`brand_settings.colors`, a nullable `sa.JSON`
column — no backfill, existing single row just gets `colors: null` and falls back to
`brandConfig.colors` defaults on the frontend; see "Brand colors" above). Generic `sa.JSON`, not
`postgresql.JSONB`, to stay consistent with "no engine-specific types outside migrations" — this is
the first JSON-typed column in the project.

## Frontend

`frontend/` is a React 19 + Vite + TypeScript SPA (no SSR) that consumes the API above end to end.
Stack: Tailwind CSS v4 (CSS-variable theming) + shadcn/ui (components copied into
`frontend/src/components/ui/`, not an npm dependency — add more with
`npx shadcn@latest add <component>` from `frontend/`), TanStack Query for all server state, Zustand
for the POS cart only, React Router, React Hook Form + Zod where forms need real validation.

```
frontend/src/
  theme/            # brandConfig (logo/name/colors, static fallback only now — see
                     # BrandSettings above) + ThemeProvider; see brand.config.ts
  stores/           # authStore.ts — the only other Zustand store besides cartStore.ts;
                     # token/user/activeBranchId + persist middleware (localStorage)
  api/              # one file per entity: typed fetch functions, mirrors the Pydantic schemas
  hooks/            # TanStack Query hooks; createCrudHooks.ts / createCrudApi (api/base.ts)
                     # generate list/get/create/update/remove for the plain catalog entities
  modules/
    auth/           # LoginPage.tsx — plain username/password form, redirects to
                     # location.state.from (or /venta) on success
    users/          # UsersPage.tsx (admin-only) — not built on SimpleCatalogPage, since the
                     # form has conditional logic (branch field only for role=empleado,
                     # password optional on edit = "leave unchanged") that page doesn't support
    settings/       # BrandSettingsPage.tsx (admin-only) — logo upload via LogoCropDialog.tsx
                     # (reuses uploadProductImage) + company name + full color palette, see
                     # BrandSettings/"Brand colors" above
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
                     # in Scope above, including the frontend-only "precio final del combo" toggle;
                     # an "Activa" checkbox in the dialog plus a per-row Power/PowerOff quick-toggle
                     # button let a promotion be deactivated without deleting it — handleSubmit used
                     # to hardcode `active: true` on every save, silently reactivating a promo the
                     # admin had just turned off if they ever re-opened it to edit something else;
                     # fixed by threading a real `active` state through the form) and
                     # PromotionDetail.tsx, a read-only "what's in this promo" breakdown shared
                     # between a "Ver detalle" row action on /promociones and a link next to
                     # "Promoción aplicada" in CartPanel.tsx during a sale
    shared/useStockOptions.ts  # stock-row -> product/variant/image/price resolver, see gotcha below
  components/       # Layout (sidebar + topbar: BranchSelector + user/logout; theme toggle in
                     # sidebar footer), PageHeader, RequireAuth.tsx/RequireAdmin.tsx (route
                     # guards), BranchSelector.tsx, BrandMetaSync.tsx (favicon/title), ui/ (shadcn)
```

Notable frontend-specific decisions, in case they look surprising:

- **Auth/branch state lives in Zustand (`authStore.ts`), not React context** — `token`, `user`
  (`id`/`username`/`role`/`branch_id`), and `activeBranchId` are one store, wrapped in Zustand's
  `persist` middleware (the *first* use of `persist` in this codebase — chosen over hand-rolling
  `useEffect`+`localStorage` the way `ThemeProvider.tsx` does for the theme alone, since the session
  needs to survive a page reload and `persist` is the standard tool for exactly that). `api/
  client.ts` reads `useAuthStore.getState()` directly (not the hook) since it's plain functions, not
  a component, to attach `Authorization: Bearer <token>`; on a 401 response it calls `.logout()`
  directly, and `RequireAuth`'s redirect happens naturally on the next render — no manual
  `window.location` needed anywhere.
- **One active-branch selector, not one per page**: `SalePage.tsx`, `SalesHistoryPage.tsx`, and
  `PurchasesPage.tsx` all used to have their own branch `<Select>` (each defaulting to
  `branches[0]` independently) — these were **removed entirely** in favor of a single
  `BranchSelector.tsx` in the topbar (`Layout.tsx`), reading/writing `authStore`'s
  `activeBranchId`. Each of those three pages now has a `useEffect` that keeps its own local
  "working branch" concept (`cartStore.branchId` for `SalePage`, a plain destructure for the other
  two) in sync with `activeBranchId` — changing the topbar selector clears the cart (same behavior
  the old per-page selector already had) and re-scopes purchases/daily-balance. For an `empleado`,
  `BranchSelector` renders as plain text (their branch, from `setActiveBranch`'s no-op guard in
  `authStore.ts` — see Authentication above) instead of a `<Select>`; for an admin whose
  `activeBranchId` is still `null` (first login), `Layout.tsx` auto-selects `branches[0]`, mirroring
  what `SalePage.tsx` used to do on its own. **`StockPage.tsx`'s two branch pickers are treated
  differently**: the "Nuevo" create-dialog's branch field became a fixed label (`activeBranchId`,
  no longer editable — this was the exact "reselect the branch on every product" friction point the
  user asked to remove), but the stock **table's** `branchFilter` (viewing/filtering stock across
  branches) was deliberately left as a manual `<Select>`, unchanged — cross-branch stock visibility
  is an intentional feature (an empleado can look up whether another branch has stock), not
  something that should collapse to "only my branch."
- **Admin-only nav items are hidden, not just route-guarded**: `Layout.tsx`'s `catalogNav` array
  (Categorías/Marcas/Colores/Talles/Sucursales/Métodos de pago/Usuarios/Configuración) and a separate
  `adminNav` array (Finanzas/Trazabilidad — kept apart from `catalogNav` since they aren't catalog
  CRUD screens) only render when `role === 'admin'` — an empleado never sees these links at all, and
  navigating to one of those URLs directly redirects to `/venta` via the `RequireAdmin` route wrapper
  (`routes.tsx` nests those routes' `<Route>`s inside `<Route element={<RequireAdmin/>}>`, itself
  inside `<Route element={<RequireAuth/>}>` — both wrappers just render `<Outlet/>` or `<Navigate/>`
  depending on `authStore`). `Clientes` and `Carteles de precio` both moved out of an admin-gated
  array into the always-visible `primaryNav`/`routes.tsx` top level — Customer management and price
  tag printing both stay shared with `empleado` (no admin restriction; confirmed explicitly for
  carteles — a cashier prints tags too).
- **`/usuarios`'s edit dialog is still the only way to change any password**, including an admin's
  own — there's no separate "change my password" self-service page. What *did* change: editing your
  **own** row there now requires an extra "Contraseña actual" field when setting a new password (see
  the Authentication section's self-password-change note) — resetting someone *else's* password
  still only needs the new one, no extra step.
- **Mobile/tablet layout**: `Layout.tsx`'s sidebar is `hidden md:flex` (desktop, ≥768px) with a
  parallel `Sheet`-based drawer (`components/ui/sheet.tsx` — new shadcn-style component, built on
  the same `radix-ui` `Dialog` primitive `dialog.tsx` already used, just anchored to a side instead
  of centered) for everything narrower, triggered by a hamburger button that appears in the header
  below `md`. Both render the same `SidebarContent` so the nav list itself isn't duplicated; the
  drawer closes itself on link click (`onNavigate` prop) so navigating doesn't leave it open.
  `PageHeader.tsx`'s title/action row and most per-page filter bars use `flex-wrap` for the same
  reason. `index.html`'s `<html lang>` was changed from `"en"` to `"es-AR"` — Chromium uses this
  (not the OS locale) to decide the digit order a native `<input type="date">` displays itself in,
  so leaving it `"en"` made every date picker in the app (Promotions, Finanzas, Trazabilidad, ...)
  show mm/dd/yyyy while every *rendered* date elsewhere used `formatDate`'s dd/mm/yyyy — a real,
  reported inconsistency fixed by this one attribute rather than by touching each date input.
- **Discount % vs $**: the backend only ever accepts an absolute `discount` amount — there is no
  percentage concept in the API. `CartPanel.tsx` keeps a `%`/`$` toggle and a raw input as
  *local UI state*, and converts to an absolute amount (recomputed against the live subtotal,
  including when the cart itself changes) before it ever reaches `cartStore.discount` or gets sent
  to `/sales/preview`/`/sales`. That local `discountRawValue`/`discountMode` state is **not**
  automatically reset by `cartStore.clear()` (which does reset `discount` itself) — a real bug found
  in manual testing where the discount input kept showing the old number after confirming a sale
  even though the underlying discount was already back to 0. Fixed with a `useEffect` in
  `CartPanel.tsx` that resets both to their defaults whenever `lines.length === 0`.
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
- **Gotcha: `text-align: center` on a shadcn `CardHeader` does not center an `<img>`.**
  `components/ui/card.tsx`'s `CardHeader` is CSS **grid** (`grid auto-rows-min items-start ...`),
  not flex — and Tailwind's Preflight reset sets `img { display: block }`. `text-align` only
  affects inline content, so it happily centers a sibling `CardTitle`'s text but has zero effect on
  a block-level `<img>`, which just sits at the start (left) edge of its full-width grid cell
  instead. Found on `LoginPage.tsx`'s logo, which looked left-aligned above the centered company
  name despite the `CardHeader` already having `items-center text-center`. Fix: give the image its
  own `mx-auto` (or `justify-self-center`) — don't rely on a `text-*` alignment class centering
  anything that isn't text.

## Production deployment

Deployed to a DonWeb VPS (Ubuntu), multi-tenant: **one client = one isolated Docker Compose
stack**, not one shared multi-tenant deployment (`Branch`/`acting_branch_id` already handles
multiple *branches of the same business*; a separate client business gets a whole separate
stack instead, for full isolation of data/secrets/uptime). As of this writing there are two live
client instances (`punto_venta_2` = tienda1, `boutique_sa`), each following the exact same
pattern below — a third client repeats it identically.

- **Root `Dockerfile`** (`uv`-based): installs deps, copies `app/`/`alembic/`, and its `CMD` runs
  `alembic upgrade head` before starting `uvicorn` — so every deploy applies pending migrations
  automatically, no manual migration step on the server ever.
- **`frontend/Dockerfile`**: multi-stage — `node:20-alpine` runs `npm run build` (with
  `VITE_API_BASE_URL=/api` baked in as a build arg, since the frontend always talks to the API at
  a same-origin relative path, never a hardcoded host), then the built `dist/` is copied into an
  `nginx:1.27-alpine` image alongside `frontend/nginx.conf`, which proxies `/api/` and `/media/`
  to the `backend` service (by Docker Compose service name) and serves everything else as the SPA
  (`try_files $uri $uri/ /index.html`).
- **`docker-compose.prod.yml`** (root) — 3 services: `postgres`, `backend` (depends on
  `postgres`'s healthcheck), `frontend`. **No `container_name` on any service** — removed
  deliberately after it caused a real collision the first time a second client instance tried to
  start on the same host (Docker requires unique container names host-wide); letting Compose
  derive names from the project directory, same as it already does for named volumes
  (`pos_postgres_data`, `pos_media` — inspect with `docker volume ls`, mountpoint via
  `docker volume inspect`), makes each per-client directory self-namespacing for free. The
  `frontend` service binds to `127.0.0.1:${FRONTEND_PORT:-8081}:80` — **not** `0.0.0.0:80` —
  because port 80/443 on the host is owned by a host-level Nginx (installed via `apt`, not
  containerized) acting as the single internet-facing reverse proxy in front of every client's
  container stack; each client gets its own `FRONTEND_PORT` (8081, 8082, 8083, ...) and its own
  `/etc/nginx/sites-available/<subdomain>` block (`proxy_pass http://127.0.0.1:<port>`) plus its
  own Let's Encrypt cert (`certbot --nginx -d <subdomain>`). This split (host Nginx terminates
  TLS + routes by `server_name`; each container stack only ever exposes a host-only port) is what
  makes adding a client purely additive — never touches an existing client's Nginx block or
  containers.
- **`.env.prod`** (per client, gitignored, `chmod 600`) — `POSTGRES_USER`/`POSTGRES_PASSWORD`/
  `POSTGRES_DB`, `SECRET_KEY`, `SERVER_IP`, `DOMAIN`, `FRONTEND_PORT`. **`POSTGRES_PASSWORD` and
  `SECRET_KEY` must be unique per client** — reusing either across instances would mean one
  client's JWTs could authenticate against another's backend, or DB credentials could cross over.
  `docker-compose.prod.yml` builds `CORS_ORIGINS` from `DOMAIN`/`SERVER_IP` and fails fast
  (`:?set a real ... in .env.prod`) if `POSTGRES_PASSWORD`/`SECRET_KEY` are left unset — Compose
  only reads this file when explicitly passed via `--env-file .env.prod` (it does **not**
  auto-load a file named anything other than literally `.env`), so every compose command in this
  project's deploy workflow includes that flag.
- **New client checklist** (all on the server, under `~/apps/<client>/`): DNS `A` record for the
  subdomain → server IP (in whichever registrar the client's domain uses) → `git clone` the repo
  into a fresh directory (reuses the same read-only GitHub deploy key already installed on the
  server, no new key needed) → new `.env.prod` from `.env.prod.example` with unique
  `POSTGRES_PASSWORD`/`SECRET_KEY` and the next free `FRONTEND_PORT` → `docker compose -f
  docker-compose.prod.yml --env-file .env.prod up -d --build` → new host Nginx site block +
  `certbot --nginx -d <subdomain>` → its own backup script/cron entry (below) → log in as the
  seeded `admin`/`admin123` and change the password immediately.
- **Backups**: one `~/backups/backup_<client>.sh` per client (not shared — each hardcodes its own
  `APP_DIR` and Docker volume name), run daily via a separate `crontab -e` line per client at a
  staggered time (e.g. tienda1 at 3:00 AM, a second client at 3:30 AM) redirecting both stdout and
  stderr to its own `.log` (`>> backup_<client>.log 2>&1` — dropping the `2>&1` silently loses
  error visibility, since cron's default mail-on-error has no MTA configured on this box). Each
  script `pg_dump`s the DB and `tar`s the `pos_media` Docker volume via a throwaway
  `docker run --rm --user "$(id -u):$(id -g)" -v <volume>:/data ... alpine tar czf ...` — the
  `--user` flag matters: without it the tar (and thus the output file on the host) ends up owned
  by `root` since the Alpine container runs as root by default, which can silently break the
  `find ... -delete` 30-day rotation running as the unprivileged `deploy` user. Backups currently
  live only on the same VPS disk — copying them off-box (rclone to cloud storage, etc.) is a known
  gap, not yet done.
- **Deploying a change**: frontend-only → `... up -d --build frontend`; backend-only, no new
  migration → `... up -d --build backend`; backend with a new Alembic migration → run
  `~/backups/backup_<client>.sh` manually first, then `... up -d --build backend` and check
  `docker compose ... logs backend | grep -i alembic` for the `Running upgrade ...` line (a
  migration failure aborts the container's startup `&&` chain, so the site stays down until
  fixed — this is why the pre-migration backup matters). None of this propagates automatically
  across clients — repeat the same `git pull` + rebuild in every client's own directory.
- **SSH access**: key-only (`PasswordAuthentication no`, `PermitRootLogin no`), non-standard port
  (set at VPS provisioning time). Each person/device should have its **own** keypair appended to
  `~/.ssh/authorized_keys` (never copy one private key across machines) so a lost device's access
  can be revoked by deleting just its one line. `ufw` only allows SSH (the custom port), 80, 443 —
  Postgres/backend/frontend container ports are never exposed beyond `127.0.0.1`.

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
- **Audit trail doesn't cover every entity**: the "Audit trail (traceability)" section above covers
  Sale/Purchase/Exchange/manual Stock adjustments/User/Customer — Category, Brand, Color, Size,
  Branch, PaymentMethod, Product, and Promotion don't record audit entries yet, even though
  `CrudService`'s generic hook would make wiring them in a small, mechanical change (just pass an
  `AuditLogService` into their `get_<entity>_service` factory and forward `acting_user` from the
  route). Not done because these are low-frequency admin catalog edits, not the "who touched money"
  concern that prompted the feature — revisit if asked.
- **Stock-duplicate merge is a frontend-only courtesy**: `StockPage.tsx` checks the already-loaded
  `useStocks()` list before submitting "Nuevo" and offers to merge quantities into an existing
  matching row — but nothing stops a second browser tab, or a direct `POST /stocks`, from racing
  past that check. The `uq_stock_variant` `IntegrityError` → `BusinessRuleViolationError` in
  `StockService.create` is the real backend enforcement, and it still doesn't cover the `color_id`/
  `size_id` both-`NULL` case (see Stock above) — a race there would silently create a second row.
- **No "forgot password" flow**: there's still no self-service reset for a locked-out user (only an
  admin can set anyone's password, via `/catalogo/usuarios`). The seeded bootstrap account
  (`admin`/`admin123`) should be changed immediately after first login in any real deployment —
  nothing in the app forces or reminds an admin to do this (changing it now does at least require
  knowing the current `admin123`, per the self-password-change fix above).
- **Finance dashboard and audit log both re-fetch full unfiltered lists client-side for drill-down**
  (`FinanceDashboardPage.tsx` calls the same `useSales`/`usePurchases`/`useExpenses`/`useExchanges`
  hooks as their list pages, then filters by date range in the browser) — fine at a single POS's
  data volume (same reasoning `SalesHistoryPage.tsx` already relies on), but would need real
  server-side pagination/filtering if the transaction volume ever grows enough to matter.
- **JWTs can't be revoked before they expire** (4h, `Settings.access_token_expire_minutes`):
  deleting or editing a `User` takes effect on their *next* request (since `get_current_user`
  re-fetches the row every time), but a token already issued keeps decoding successfully — and thus
  keeps *authenticating* — until it naturally expires, even if the account was deleted in the
  meantime (the re-fetch would then 404 on the next request, not immediately). There's no token
  blocklist/refresh-token rotation. Acceptable for a single-POS internal tool; would need revisiting
  before exposing this to untrusted users or a longer session window.

None of these are scheduled — flag them to the user before picking one up, since each implies a
design decision (e.g. how usage caps should be scoped, whether category combos should be
per-product) similar to the ones resolved for the Promotion redesign above.
