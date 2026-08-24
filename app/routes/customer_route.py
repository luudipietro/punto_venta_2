from fastapi import APIRouter, Depends, Query, status

from app.domain.customer import Customer
from app.schemas.customer_schema import CustomerCreate, CustomerRead, CustomerUpdate
from app.services.customer_service import CustomerService, get_customer_service

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", response_model=list[CustomerRead])
async def list_customers(
    q: str | None = Query(default=None, description="Filter by dni or name substring"),
    service: CustomerService = Depends(get_customer_service),
) -> list[Customer]:
    return await service.list_all(q)


@router.get("/{customer_id}", response_model=CustomerRead)
async def get_customer(
    customer_id: int, service: CustomerService = Depends(get_customer_service)
) -> Customer:
    return await service.get_by_id(customer_id)


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate, service: CustomerService = Depends(get_customer_service)
) -> Customer:
    return await service.create(Customer(**payload.model_dump()))


@router.put("/{customer_id}", response_model=CustomerRead)
async def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    service: CustomerService = Depends(get_customer_service),
) -> Customer:
    return await service.update(customer_id, Customer(**payload.model_dump()))


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: int, service: CustomerService = Depends(get_customer_service)
) -> None:
    await service.delete(customer_id)
