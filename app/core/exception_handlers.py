from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    BusinessRuleViolationError,
    EntityNotFoundError,
    InsufficientStockError,
)


async def entity_not_found_handler(_: Request, exc: EntityNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})


async def insufficient_stock_handler(_: Request, exc: InsufficientStockError) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)})


async def business_rule_violation_handler(
    _: Request, exc: BusinessRuleViolationError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": str(exc)}
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(EntityNotFoundError, entity_not_found_handler)
    app.add_exception_handler(InsufficientStockError, insufficient_stock_handler)
    app.add_exception_handler(BusinessRuleViolationError, business_rule_violation_handler)
