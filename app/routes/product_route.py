from fastapi import APIRouter, Depends, status

from app.domain.product import Product
from app.schemas.product_schema import ProductCreate, ProductRead, ProductUpdate
from app.services.product_service import ProductService, get_product_service

router = APIRouter(prefix="/products", tags=["Products"])


@router.get("", response_model=list[ProductRead])
async def list_products(service: ProductService = Depends(get_product_service)) -> list[Product]:
    return await service.list_all()


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(
    product_id: int, service: ProductService = Depends(get_product_service)
) -> Product:
    return await service.get_by_id(product_id)


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate, service: ProductService = Depends(get_product_service)
) -> Product:
    return await service.create(Product(**payload.model_dump()))


@router.put("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    service: ProductService = Depends(get_product_service),
) -> Product:
    return await service.update(product_id, Product(**payload.model_dump()))


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: int, service: ProductService = Depends(get_product_service)
) -> None:
    await service.delete(product_id)
