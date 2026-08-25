from fastapi import APIRouter, Depends, status

from app.domain.size import Size
from app.schemas.size_schema import SizeCreate, SizeRead
from app.services.size_service import SizeService, get_size_service

router = APIRouter(prefix="/sizes", tags=["Sizes"])


@router.get("", response_model=list[SizeRead])
async def list_sizes(service: SizeService = Depends(get_size_service)) -> list[Size]:
    return await service.list_all()


@router.get("/{size_id}", response_model=SizeRead)
async def get_size(size_id: int, service: SizeService = Depends(get_size_service)) -> Size:
    return await service.get_by_id(size_id)


@router.post("", response_model=SizeRead, status_code=status.HTTP_201_CREATED)
async def create_size(
    payload: SizeCreate, service: SizeService = Depends(get_size_service)
) -> Size:
    return await service.create(Size(**payload.model_dump()))


@router.delete("/{size_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_size(size_id: int, service: SizeService = Depends(get_size_service)) -> None:
    await service.delete(size_id)
