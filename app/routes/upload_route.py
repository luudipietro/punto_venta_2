import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.auth import require_admin
from app.core.config import get_settings
from app.core.video import VideoQuality, process_video

router = APIRouter(prefix="/uploads", tags=["Uploads"])

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

# Size of the original file, before conversion. Keep in step with the frontend's
# own check (`api/product.ts`) and Nginx's `client_max_body_size`.
MAX_VIDEO_UPLOAD_SIZE = 150 * 1024 * 1024  # 150MB
UPLOAD_CHUNK_SIZE = 1024 * 1024
# Accepted content type -> ffmpeg demuxer used to read it.
VIDEO_DEMUXERS = {
    "video/mp4": "mov",
    "video/quicktime": "mov",
    "video/x-m4v": "mov",
    "video/3gpp": "mov",
    "video/webm": "matroska",
}


class UploadRead(BaseModel):
    url: str


@router.post("/images", response_model=UploadRead, status_code=status.HTTP_201_CREATED)
async def upload_image(file: UploadFile) -> UploadRead:
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

    return UploadRead(url=f"{settings.media_url}/products/{filename}")


@router.post(
    "/videos",
    response_model=UploadRead,
    status_code=status.HTTP_201_CREATED,
    # Admin-only, unlike images: only the storefront's gallery and hero (both
    # admin-managed) use videos, and converting one is expensive.
    dependencies=[Depends(require_admin)],
)
async def upload_video(
    file: UploadFile, quality: VideoQuality = VideoQuality.STANDARD
) -> UploadRead:
    """Stores a video converted to MP4, plus a poster with the same name and a
    `.jpg` extension — the frontends derive the poster URL from that. A video
    without sound gets a `-silent` name, so no sound button is offered for it."""
    demuxer = VIDEO_DEMUXERS.get(file.content_type or "")
    if demuxer is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "El archivo debe ser un video (mp4, mov, webm)"
        )

    settings = get_settings()
    videos_dir = settings.media_root / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)
    name = uuid.uuid4().hex

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
        source = Path(temp_dir) / "source"
        size = 0
        with source.open("wb") as target:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                size += len(chunk)
                if size > MAX_VIDEO_UPLOAD_SIZE:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST, "El video debe pesar 150MB o menos"
                    )
                target.write(chunk)

        has_audio = await process_video(
            source, videos_dir / f"{name}.mp4", videos_dir / f"{name}.jpg", demuxer, quality
        )

    if not has_audio:
        for extension in (".mp4", ".jpg"):
            (videos_dir / f"{name}{extension}").rename(videos_dir / f"{name}-silent{extension}")
        name = f"{name}-silent"

    return UploadRead(url=f"{settings.media_url}/videos/{name}.mp4")
