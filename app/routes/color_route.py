from fastapi import APIRouter, Depends, status

from app.domain.color import Color
from app.schemas.color_schema import ColorCreate, ColorRead, ColorUpdate
from app.services.color_service import ColorService, get_color_service

router = APIRouter(prefix="/colors", tags=["Colors"])


@router.get("", response_model=list[ColorRead])
async def list_colors(service: ColorService = Depends(get_color_service)) -> list[Color]:
    return await service.list_all()


@router.get("/{color_id}", response_model=ColorRead)
async def get_color(color_id: int, service: ColorService = Depends(get_color_service)) -> Color:
    return await service.get_by_id(color_id)


@router.post("", response_model=ColorRead, status_code=status.HTTP_201_CREATED)
async def create_color(
    payload: ColorCreate, service: ColorService = Depends(get_color_service)
) -> Color:
    return await service.create(Color(**payload.model_dump()))


@router.put("/{color_id}", response_model=ColorRead)
async def update_color(
    color_id: int, payload: ColorUpdate, service: ColorService = Depends(get_color_service)
) -> Color:
    return await service.update(color_id, Color(**payload.model_dump()))


@router.delete("/{color_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_color(color_id: int, service: ColorService = Depends(get_color_service)) -> None:
    await service.delete(color_id)
