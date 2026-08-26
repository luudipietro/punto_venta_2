from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.branch import Branch
from app.domain.brand import Brand
from app.domain.category import Category
from app.domain.customer import Customer
from app.domain.payment_method import PaymentMethod
from app.domain.product import Product
from app.domain.sale_item import SaleItem
from app.domain.sale_payment import SalePayment
from app.domain.stock import Stock
from app.domain.user import User, UserRole
from app.repositories.audit_log_repository import SqlAlchemyAuditLogRepository
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.brand_repository import SqlAlchemyBrandRepository
from app.repositories.category_repository import SqlAlchemyCategoryRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.customer_repository import SqlAlchemyCustomerRepository
from app.repositories.exchange_new_item_repository import SqlAlchemyExchangeNewItemRepository
from app.repositories.exchange_return_item_repository import (
    SqlAlchemyExchangeReturnItemRepository,
)
from app.repositories.payment_method_repository import SqlAlchemyPaymentMethodRepository
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.promotion_item_repository import SqlAlchemyPromotionItemRepository
from app.repositories.promotion_repository import SqlAlchemyPromotionRepository
from app.repositories.sale_item_repository import SqlAlchemySaleItemRepository
from app.repositories.sale_payment_repository import SqlAlchemySalePaymentRepository
from app.repositories.sale_repository import SqlAlchemySaleRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.audit_log_service import AuditLogService
from app.services.customer_service import CustomerService
from app.services.promotion_service import PromotionService
from app.services.sale_service import SaleService
from app.services.stock_service import StockService

_ACTOR = User(id=1, username="admin", password_hash="", role=UserRole.ADMIN, branch_id=None)


async def test_create_and_cancel_sale_are_recorded(db_session: AsyncSession) -> None:
    audit = AuditLogService(SqlAlchemyAuditLogRepository(db_session))
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    product = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera", category_id=category.id, brand_id=brand.id,
            cost=Decimal("10"), price=Decimal("20"),
        )
    )
    stock = await SqlAlchemyStockRepository(db_session).create(
        Stock(product_id=product.id, branch_id=branch.id, quantity=10, color_id=None, size_id=None)
    )
    cash = await SqlAlchemyPaymentMethodRepository(db_session).create(
        PaymentMethod(name="Efectivo", is_cash=True)
    )

    sale_service = SaleService(
        SqlAlchemySaleRepository(db_session),
        SqlAlchemySaleItemRepository(db_session),
        SqlAlchemySalePaymentRepository(db_session),
        StockService(
            SqlAlchemyStockRepository(db_session),
            SqlAlchemyProductRepository(db_session),
            SqlAlchemyColorRepository(db_session),
            SqlAlchemySizeRepository(db_session),
            SqlAlchemyBranchRepository(db_session),
        ),
        SqlAlchemyPaymentMethodRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        PromotionService(
            SqlAlchemyPromotionRepository(db_session),
            SqlAlchemyPromotionItemRepository(db_session),
            SqlAlchemyProductRepository(db_session),
            SqlAlchemyCategoryRepository(db_session),
        ),
        SqlAlchemyCustomerRepository(db_session),
        SqlAlchemyExchangeReturnItemRepository(db_session),
        SqlAlchemyExchangeNewItemRepository(db_session),
        audit,
    )

    sale = await sale_service.create_sale(
        branch_id=branch.id,
        discount=Decimal("0"),
        items=[SaleItem(stock_id=stock.id, quantity=1, unit_price=Decimal("20.00"))],
        payments=[
            SalePayment(
                payment_method_id=cash.id,
                amount_without_surcharge=Decimal("20.00"),
                amount_with_surcharge=Decimal("20.00"),
            )
        ],
        acting_user=_ACTOR,
    )
    await sale_service.cancel_sale(sale.id, acting_user=_ACTOR)

    entries = await audit.list_all()
    actions = [e.action for e in entries]
    assert "sale.create" in actions
    assert "sale.cancel" in actions
    create_entry = next(e for e in entries if e.action == "sale.create")
    assert create_entry.actor_username == "admin"
    assert create_entry.entity_id == sale.id


async def test_manual_stock_adjustment_is_recorded_but_not_internal_ones(
    db_session: AsyncSession,
) -> None:
    audit = AuditLogService(SqlAlchemyAuditLogRepository(db_session))
    branch = await SqlAlchemyBranchRepository(db_session).create(Branch(name="Central"))
    category = await SqlAlchemyCategoryRepository(db_session).create(Category(name="Ropa"))
    brand = await SqlAlchemyBrandRepository(db_session).create(Brand(name="Nike"))
    product = await SqlAlchemyProductRepository(db_session).create(
        Product(
            name="Remera", category_id=category.id, brand_id=brand.id,
            cost=Decimal("10"), price=Decimal("20"),
        )
    )
    stock = await SqlAlchemyStockRepository(db_session).create(
        Stock(product_id=product.id, branch_id=branch.id, quantity=10, color_id=None, size_id=None)
    )

    stock_service = StockService(
        SqlAlchemyStockRepository(db_session),
        SqlAlchemyProductRepository(db_session),
        SqlAlchemyColorRepository(db_session),
        SqlAlchemySizeRepository(db_session),
        SqlAlchemyBranchRepository(db_session),
        audit,
    )

    # No acting_user => internal/automatic adjustment, should NOT be logged.
    await stock_service.increase_quantity(stock.id, 3)
    assert await audit.list_all() == []

    # Manual adjustment with an acting_user => should be logged.
    await stock_service.decrease_quantity(stock.id, 2, acting_user=_ACTOR)
    entries = await audit.list_all()
    assert len(entries) == 1
    assert entries[0].action == "stock.decrease"


async def test_customer_create_update_delete_are_recorded(db_session: AsyncSession) -> None:
    audit = AuditLogService(SqlAlchemyAuditLogRepository(db_session))
    service = CustomerService(SqlAlchemyCustomerRepository(db_session), audit)

    created = await service.create(Customer(dni="11223344", name="Test"), acting_user=_ACTOR)
    await service.update(
        created.id, Customer(dni="11223344", name="Test2"), acting_user=_ACTOR
    )
    await service.delete(created.id, acting_user=_ACTOR)

    entries = await audit.list_all()
    actions = sorted(e.action for e in entries)
    assert actions == ["customer.create", "customer.delete", "customer.update"]
