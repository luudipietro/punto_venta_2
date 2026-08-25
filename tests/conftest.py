from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.core.auth import get_current_user
from app.domain.user import User, UserRole
from app.infrastructure.db.base import Base

# Imported for their side effect of registering tables on Base.metadata.
from app.infrastructure.db.models import (  # noqa: F401
    branch_model,
    brand_model,
    brand_settings_model,
    category_model,
    color_model,
    customer_model,
    exchange_model,
    exchange_new_item_model,
    exchange_payment_model,
    exchange_return_item_model,
    expense_model,
    payment_method_model,
    product_image_model,
    product_model,
    promotion_item_model,
    promotion_model,
    purchase_item_model,
    purchase_model,
    sale_item_model,
    sale_model,
    sale_payment_model,
    size_model,
    stock_model,
    user_model,
)
from app.infrastructure.db.session import get_db
from app.main import app


@pytest_asyncio.fixture
async def engine() -> AsyncGenerator[AsyncEngine, None]:
    test_engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    # SQLite ignores FK constraints unless explicitly told to enforce them
    # per-connection — without this, tests can't catch the IntegrityError ->
    # BusinessRuleViolationError translation that real Postgres would trigger
    # (e.g. deleting a Stock/Product still referenced elsewhere).
    @event.listens_for(test_engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield test_engine

    await test_engine.dispose()


@pytest_asyncio.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_session(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def override_get_current_user() -> User:
        return User(id=1, username="admin", password_hash="", role=UserRole.ADMIN, branch_id=None)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client_no_auth(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncClient, None]:
    """Same as `client`, but without the `get_current_user` override — for
    tests that need to exercise real 401/403 behavior."""

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client

    app.dependency_overrides.clear()
