from fastapi import APIRouter, Depends, status

from app.core.auth import require_admin
from app.domain.product import Product
from app.domain.product_image import ProductImage
from app.schemas.product_image_schema import ProductImageCreate, ProductImageRead
from app.schemas.product_schema import ProductCreate, ProductRead, ProductUpdate
from app.services.product_image_service import ProductImageService, get_product_image_service
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


@router.post(
    "",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
)
# No require_admin here on purpose: an empleado registering a Purchase can
# create a brand-new Product inline (PurchasesPage.tsx's "+ Crear producto
# nuevo") since Purchase itself is shared, not admin-only — see CLAUDE.md.
async def create_product(
    payload: ProductCreate, service: ProductService = Depends(get_product_service)
) -> Product:
    return await service.create(Product(**payload.model_dump()))


@router.put("/{product_id}", response_model=ProductRead, dependencies=[Depends(require_admin)])
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    service: ProductService = Depends(get_product_service),
) -> Product:
    return await service.update(product_id, Product(**payload.model_dump()))


@router.delete(
    "/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)]
)
async def delete_product(
    product_id: int, service: ProductService = Depends(get_product_service)
) -> None:
    await service.delete(product_id)


@router.get("/{product_id}/images", response_model=list[ProductImageRead])
async def list_product_images(
    product_id: int, service: ProductImageService = Depends(get_product_image_service)
) -> list[ProductImage]:
    return await service.list_by_product(product_id)


@router.post(
    "/{product_id}/images",
    response_model=ProductImageRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def add_product_image(
    product_id: int,
    payload: ProductImageCreate,
    service: ProductImageService = Depends(get_product_image_service),
) -> ProductImage:
    return await service.add_image(product_id, payload.url)


@router.delete(
    "/{product_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def remove_product_image(
    product_id: int,
    image_id: int,
    service: ProductImageService = Depends(get_product_image_service),
) -> None:
    await service.remove_image(product_id, image_id)
