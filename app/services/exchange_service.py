from decimal import Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.exchange import Exchange
from app.domain.exchange_new_item import ExchangeNewItem
from app.domain.exchange_payment import ExchangePayment
from app.domain.exchange_return_item import ExchangeReturnItem
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import SqlAlchemyBranchRepository
from app.repositories.color_repository import SqlAlchemyColorRepository
from app.repositories.exchange_new_item_repository import (
    ExchangeNewItemRepository,
    SqlAlchemyExchangeNewItemRepository,
)
from app.repositories.exchange_payment_repository import (
    ExchangePaymentRepository,
    SqlAlchemyExchangePaymentRepository,
)
from app.repositories.exchange_repository import ExchangeRepository, SqlAlchemyExchangeRepository
from app.repositories.exchange_return_item_repository import (
    ExchangeReturnItemRepository,
    SqlAlchemyExchangeReturnItemRepository,
)
from app.repositories.payment_method_repository import (
    PaymentMethodRepository,
    SqlAlchemyPaymentMethodRepository,
)
from app.repositories.product_repository import SqlAlchemyProductRepository
from app.repositories.sale_item_repository import SaleItemRepository, SqlAlchemySaleItemRepository
from app.repositories.sale_repository import SaleRepository, SqlAlchemySaleRepository
from app.repositories.size_repository import SqlAlchemySizeRepository
from app.repositories.stock_repository import SqlAlchemyStockRepository
from app.services.stock_service import StockService


class ExchangeService:
    """Orchestrates the exchange/return transaction against an existing,
    immutable Sale: validates that returned items were actually sold, in
    quantities that don't exceed what was sold minus what prior Exchange
    records against the same Sale already returned, restocks returned items,
    destocks any new items given in exchange, checks the payment balance,
    and persists everything as a single unit of work on the shared session."""

    def __init__(
        self,
        exchange_repository: ExchangeRepository,
        exchange_return_item_repository: ExchangeReturnItemRepository,
        exchange_new_item_repository: ExchangeNewItemRepository,
        exchange_payment_repository: ExchangePaymentRepository,
        stock_service: StockService,
        sale_repository: SaleRepository,
        sale_item_repository: SaleItemRepository,
        payment_method_repository: PaymentMethodRepository,
    ) -> None:
        self._exchange_repository = exchange_repository
        self._exchange_return_item_repository = exchange_return_item_repository
        self._exchange_new_item_repository = exchange_new_item_repository
        self._exchange_payment_repository = exchange_payment_repository
        self._stock_service = stock_service
        self._sale_repository = sale_repository
        self._sale_item_repository = sale_item_repository
        self._payment_method_repository = payment_method_repository

    async def list_all(self) -> list[Exchange]:
        return await self._exchange_repository.list_all()

    async def get_by_id(self, exchange_id: int) -> Exchange:
        exchange = await self._exchange_repository.get_by_id(exchange_id)
        if exchange is None:
            raise EntityNotFoundError("Exchange", exchange_id)
        return exchange

    async def get_returned_items(self, exchange_id: int) -> list[ExchangeReturnItem]:
        return await self._exchange_return_item_repository.list_by_exchange(exchange_id)

    async def get_new_items(self, exchange_id: int) -> list[ExchangeNewItem]:
        return await self._exchange_new_item_repository.list_by_exchange(exchange_id)

    async def get_payments(self, exchange_id: int) -> list[ExchangePayment]:
        return await self._exchange_payment_repository.list_by_exchange(exchange_id)

    async def create_exchange(
        self,
        sale_id: int,
        returned_items: list[ExchangeReturnItem],
        new_items: list[ExchangeNewItem],
        payments: list[ExchangePayment],
    ) -> Exchange:
        sale = await self._sale_repository.get_by_id(sale_id)
        if sale is None:
            raise EntityNotFoundError("Sale", sale_id)

        sold_quantity_by_stock: dict[int, int] = {}
        for sale_item in await self._sale_item_repository.list_by_sale(sale_id):
            sold_quantity_by_stock[sale_item.stock_id] = (
                sold_quantity_by_stock.get(sale_item.stock_id, 0) + sale_item.quantity
            )

        already_returned_by_stock: dict[int, int] = {}
        for prior_return in await self._exchange_return_item_repository.list_by_sale(sale_id):
            already_returned_by_stock[prior_return.stock_id] = (
                already_returned_by_stock.get(prior_return.stock_id, 0) + prior_return.quantity
            )
        for stock_id, already_returned in already_returned_by_stock.items():
            if stock_id in sold_quantity_by_stock:
                sold_quantity_by_stock[stock_id] -= already_returned

        for returned_item in returned_items:
            sold_quantity = sold_quantity_by_stock.get(returned_item.stock_id)
            if sold_quantity is None:
                raise BusinessRuleViolationError(
                    f"Stock {returned_item.stock_id} was not part of sale {sale_id}"
                )
            if returned_item.quantity > sold_quantity:
                raise BusinessRuleViolationError(
                    f"Cannot return {returned_item.quantity} unit(s) of stock "
                    f"{returned_item.stock_id}; only {sold_quantity} were sold"
                )

        returned_total = sum(
            (item.unit_price * item.quantity for item in returned_items), Decimal("0")
        )
        new_total = sum((item.unit_price * item.quantity for item in new_items), Decimal("0"))
        balance = new_total - returned_total

        paid_balance = sum((payment.amount for payment in payments), Decimal("0"))
        if paid_balance != balance:
            raise BusinessRuleViolationError(
                f"Payments total ({paid_balance}) does not match the exchange balance ({balance})"
            )

        for payment in payments:
            if await self._payment_method_repository.get_by_id(payment.payment_method_id) is None:
                raise EntityNotFoundError("PaymentMethod", payment.payment_method_id)

        exchange = await self._exchange_repository.create(
            Exchange(sale_id=sale_id, branch_id=sale.branch_id)
        )

        for returned_item in returned_items:
            await self._stock_service.increase_quantity(
                returned_item.stock_id, returned_item.quantity
            )
            returned_item.exchange_id = exchange.id
            created_item = await self._exchange_return_item_repository.create(returned_item)
            returned_item.id = created_item.id

        for new_item in new_items:
            await self._stock_service.decrease_quantity(new_item.stock_id, new_item.quantity)
            new_item.exchange_id = exchange.id
            created_item = await self._exchange_new_item_repository.create(new_item)
            new_item.id = created_item.id

        for payment in payments:
            payment.exchange_id = exchange.id
            created_payment = await self._exchange_payment_repository.create(payment)
            payment.id = created_payment.id

        return exchange


def get_exchange_service(session: AsyncSession = Depends(get_db)) -> ExchangeService:
    return ExchangeService(
        SqlAlchemyExchangeRepository(session),
        SqlAlchemyExchangeReturnItemRepository(session),
        SqlAlchemyExchangeNewItemRepository(session),
        SqlAlchemyExchangePaymentRepository(session),
        StockService(
            SqlAlchemyStockRepository(session),
            SqlAlchemyProductRepository(session),
            SqlAlchemyColorRepository(session),
            SqlAlchemySizeRepository(session),
            SqlAlchemyBranchRepository(session),
        ),
        SqlAlchemySaleRepository(session),
        SqlAlchemySaleItemRepository(session),
        SqlAlchemyPaymentMethodRepository(session),
    )
