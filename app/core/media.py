import logging
from urllib.parse import urlparse

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def delete_media_file(url: str | None) -> None:
    """Best-effort delete of a locally-stored uploaded file, given a URL as
    returned by `POST /uploads/images` or `/uploads/videos`. Callers store it
    with the frontend's API base in front, so it shows up as
    `http://host/media/products/xxx.jpg` (dev), `/api/media/...` (production)
    or the bare `/media/...` — all three are handled. Deleting a video also
    deletes its poster.

    No-ops for anything that isn't a locally-served media path (`None`, a
    static frontend asset like the default `/brand/logo.svg`, some other
    external URL) and swallows any filesystem error — deleting stored media
    is cleanup, it should never fail the request that triggered it (e.g.
    replacing a product's photo must still succeed even if the old file was
    already missing).
    """
    if not url:
        return
    settings = get_settings()
    prefix = f"{settings.media_url}/"
    path = urlparse(url).path
    if path.startswith(f"/api{prefix}"):
        path = path.removeprefix("/api")
    if not path.startswith(prefix):
        return
    media_root = settings.media_root.resolve()
    file_path = (media_root / path[len(prefix) :]).resolve()
    # The URL is stored data — never follow a `..` out of the media folder.
    if not file_path.is_relative_to(media_root):
        return
    targets = [file_path]
    if file_path.suffix == ".mp4":
        targets.append(file_path.with_suffix(".jpg"))
    for target in targets:
        try:
            target.unlink(missing_ok=True)
        except OSError as exc:
            # e.g. Windows refusing to delete a file that is being streamed.
            logger.warning("Could not delete media file %s: %s", target, exc)
