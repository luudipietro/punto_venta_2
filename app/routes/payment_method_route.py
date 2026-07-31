from fastapi import APIRouter, Depends, status

from app.domain.payment_method import PaymentMethod
from app.schemas.payment_method_schema import (
    PaymentMethodCreate,
    PaymentMethodRead,
    PaymentMethodUpdate,
)
from app.services.payment_method_service import PaymentMethodService, get_payment_method_service

router = APIRouter(prefix="/payment-methods", tags=["Payment Methods"])


@router.get("", response_model=list[PaymentMethodRead])
async def list_payment_methods(
    service: PaymentMethodService = Depends(get_payment_method_service),
) -> list[PaymentMethod]:
    return await service.list_all()


@router.get("/{payment_method_id}", response_model=PaymentMethodRead)
async def get_payment_method(
    payment_method_id: int,
    service: PaymentMethodService = Depends(get_payment_method_service),
) -> PaymentMethod:
    return await service.get_by_id(payment_method_id)


@router.post("", response_model=PaymentMethodRead, status_code=status.HTTP_201_CREATED)
async def create_payment_method(
    payload: PaymentMethodCreate,
    service: PaymentMethodService = Depends(get_payment_method_service),
) -> PaymentMethod:
    return await service.create(PaymentMethod(**payload.model_dump()))


@router.put("/{payment_method_id}", response_model=PaymentMethodRead)
async def update_payment_method(
    payment_method_id: int,
    payload: PaymentMethodUpdate,
    service: PaymentMethodService = Depends(get_payment_method_service),
) -> PaymentMethod:
    return await service.update(payment_method_id, PaymentMethod(**payload.model_dump()))


@router.delete("/{payment_method_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_method(
    payment_method_id: int,
    service: PaymentMethodService = Depends(get_payment_method_service),
) -> None:
    await service.delete(payment_method_id)
