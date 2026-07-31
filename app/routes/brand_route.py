from fastapi import APIRouter, Depends, status

from app.domain.brand import Brand
from app.schemas.brand_schema import BrandCreate, BrandRead, BrandUpdate
from app.services.brand_service import BrandService, get_brand_service

router = APIRouter(prefix="/brands", tags=["Brands"])


@router.get("", response_model=list[BrandRead])
async def list_brands(service: BrandService = Depends(get_brand_service)) -> list[Brand]:
    return await service.list_all()


@router.get("/{brand_id}", response_model=BrandRead)
async def get_brand(brand_id: int, service: BrandService = Depends(get_brand_service)) -> Brand:
    return await service.get_by_id(brand_id)


@router.post("", response_model=BrandRead, status_code=status.HTTP_201_CREATED)
async def create_brand(
    payload: BrandCreate, service: BrandService = Depends(get_brand_service)
) -> Brand:
    return await service.create(Brand(**payload.model_dump()))


@router.put("/{brand_id}", response_model=BrandRead)
async def update_brand(
    brand_id: int, payload: BrandUpdate, service: BrandService = Depends(get_brand_service)
) -> Brand:
    return await service.update(brand_id, Brand(**payload.model_dump()))


@router.delete("/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brand(brand_id: int, service: BrandService = Depends(get_brand_service)) -> None:
    await service.delete(brand_id)
