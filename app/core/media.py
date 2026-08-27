from urllib.parse import urlparse

from app.core.config import get_settings


def delete_media_file(url: str | None) -> None:
    """Best-effort delete of a locally-stored uploaded file, given a URL as
    returned by `POST /uploads/images` (frontend callers store this as an
    absolute URL, e.g. `http://host/media/products/xxx.jpg`; some callers
    only ever see the relative `/media/products/xxx.jpg` form — `urlparse`
    handles both the same way).

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
    if not path.startswith(prefix):
        return
    file_path = settings.media_root / path[len(prefix) :]
    try:
        file_path.unlink(missing_ok=True)
    except OSError:
        pass
