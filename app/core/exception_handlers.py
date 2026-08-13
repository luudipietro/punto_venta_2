import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    BusinessRuleViolationError,
    EntityNotFoundError,
    InsufficientStockError,
)

logger = logging.getLogger(__name__)


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


async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    """Catches anything not covered by the domain-error handlers above.

    Without this, an unhandled exception propagates past Starlette's
    ExceptionMiddleware (which CORSMiddleware sits inside of) up to
    ServerErrorMiddleware, whose 500 response never passes back through
    CORSMiddleware — the browser then reports a misleading CORS error instead
    of the real 500. Registering a handler keeps the response inside
    ExceptionMiddleware so CORS headers still get applied.
    """
    logger.exception("Unhandled exception while processing request", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(EntityNotFoundError, entity_not_found_handler)
    app.add_exception_handler(InsufficientStockError, insufficient_stock_handler)
    app.add_exception_handler(BusinessRuleViolationError, business_rule_violation_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
