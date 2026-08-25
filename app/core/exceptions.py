class DomainError(Exception):
    """Base class for errors raised by the domain/service layer."""


# Entity names are passed in English at each raise site (matching the
# domain/class names throughout the codebase), then translated here for the
# user-facing message — keeps call sites unchanged (`EntityNotFoundError("Product", id)`)
# while every message a user actually sees is in Spanish.
_ENTITY_NAMES_ES = {
    "Product": "producto",
    "ProductImage": "imagen de producto",
    "Category": "categoría",
    "Brand": "marca",
    "Branch": "sucursal",
    "Color": "color",
    "Size": "talle",
    "Stock": "stock",
    "Sale": "venta",
    "Customer": "cliente",
    "PaymentMethod": "método de pago",
    "Exchange": "cambio",
    "Purchase": "compra",
    "Expense": "gasto",
    "Promotion": "promoción",
}


class EntityNotFoundError(DomainError):
    """Raised when a lookup by id does not match any record."""

    def __init__(self, entity_name: str, entity_id: object) -> None:
        self.entity_name = entity_name
        self.entity_id = entity_id
        display_name = _ENTITY_NAMES_ES.get(entity_name, entity_name)
        super().__init__(f"No se encontró {display_name} con id {entity_id}")


class InsufficientStockError(DomainError):
    """Raised when a sale requests more units than are available in stock."""

    def __init__(self, stock_id: int, requested: int, available: int) -> None:
        self.stock_id = stock_id
        self.requested = requested
        self.available = available
        super().__init__(
            f"El stock {stock_id} tiene {available} unidad(es) disponible(s), "
            f"se solicitaron {requested}"
        )


class BusinessRuleViolationError(DomainError):
    """Raised when an operation would break a domain invariant (e.g. totals mismatch)."""
