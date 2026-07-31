class DomainError(Exception):
    """Base class for errors raised by the domain/service layer."""


class EntityNotFoundError(DomainError):
    """Raised when a lookup by id does not match any record."""

    def __init__(self, entity_name: str, entity_id: object) -> None:
        self.entity_name = entity_name
        self.entity_id = entity_id
        super().__init__(f"{entity_name} with id={entity_id!r} was not found")


class InsufficientStockError(DomainError):
    """Raised when a sale requests more units than are available in stock."""

    def __init__(self, stock_id: int, requested: int, available: int) -> None:
        self.stock_id = stock_id
        self.requested = requested
        self.available = available
        super().__init__(
            f"Stock {stock_id} has {available} unit(s) available, {requested} requested"
        )


class BusinessRuleViolationError(DomainError):
    """Raised when an operation would break a domain invariant (e.g. totals mismatch)."""
