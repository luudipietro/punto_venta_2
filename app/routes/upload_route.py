import uuid

from fastapi import APIRouter, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter(prefix="/uploads", tags=["Uploads"])

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


class UploadImageRead(BaseModel):
    url: str


@router.post("/images", response_model=UploadImageRead, status_code=status.HTTP_201_CREATED)
async def upload_image(file: UploadFile) -> UploadImageRead:
    if file.content_type not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "El archivo debe ser una imagen (jpeg, png, webp, gif)"
        )

    contents = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La imagen debe pesar 5MB o menos")

    settings = get_settings()
    products_dir = settings.media_root / "products"
    products_dir.mkdir(parents=True, exist_ok=True)

    extension = ALLOWED_EXTENSIONS[file.content_type]
    filename = f"{uuid.uuid4().hex}{extension}"
    (products_dir / filename).write_bytes(contents)

    return UploadImageRead(url=f"{settings.media_url}/products/{filename}")
