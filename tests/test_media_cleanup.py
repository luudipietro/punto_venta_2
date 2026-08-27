from pathlib import Path

import pytest

from app.core import media
from app.core.config import Settings


def _settings(tmp_path: Path) -> Settings:
    return Settings(media_root=tmp_path, media_url="/media")


def test_delete_media_file_removes_a_locally_stored_file(tmp_path: Path, monkeypatch) -> None:
    products_dir = tmp_path / "products"
    products_dir.mkdir()
    file_path = products_dir / "abc123.jpg"
    file_path.write_bytes(b"fake image bytes")
    monkeypatch.setattr(media, "get_settings", lambda: _settings(tmp_path))

    media.delete_media_file("http://localhost:8000/media/products/abc123.jpg")

    assert not file_path.exists()


def test_delete_media_file_accepts_a_relative_url_too(tmp_path: Path, monkeypatch) -> None:
    products_dir = tmp_path / "products"
    products_dir.mkdir()
    file_path = products_dir / "def456.jpg"
    file_path.write_bytes(b"fake image bytes")
    monkeypatch.setattr(media, "get_settings", lambda: _settings(tmp_path))

    media.delete_media_file("/media/products/def456.jpg")

    assert not file_path.exists()


@pytest.mark.parametrize(
    "url",
    [None, "", "/brand/logo.svg", "https://example.com/not-our-media/x.jpg"],
)
def test_delete_media_file_ignores_non_local_media_urls(
    url: str | None, tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(media, "get_settings", lambda: _settings(tmp_path))

    # Must not raise, regardless of what (if anything) is on disk.
    media.delete_media_file(url)


def test_delete_media_file_is_a_no_op_when_file_already_missing(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(media, "get_settings", lambda: _settings(tmp_path))

    media.delete_media_file("/media/products/never-existed.jpg")
