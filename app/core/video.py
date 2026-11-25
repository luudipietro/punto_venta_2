"""Converts an uploaded video into the single format the storefront serves.

Phones record large files in codecs not every browser can play (an iPhone
defaults to HEVC `.mov`), so every upload is re-encoded to H.264/AAC MP4,
capped at 1280px on its longest side, with a JPEG poster next to it. The
ffmpeg binary comes from the `imageio-ffmpeg` package, so there is nothing to
install on the host or in the Docker image.
"""

import asyncio
import logging
import re
import subprocess
from pathlib import Path

import imageio_ffmpeg

from app.core.exceptions import BusinessRuleViolationError

logger = logging.getLogger(__name__)

MAX_DURATION_SECONDS = 120
MAX_DIMENSION = 1280
# Kept under the 300s proxy timeout Nginx is configured with for this upload.
TIMEOUT_SECONDS = 280

# ffmpeg uses every core it can get — one conversion at a time keeps a small
# VPS responsive for the rest of the API.
_conversion_slot = asyncio.Semaphore(1)

_DURATION_PATTERN = re.compile(r"Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)")

_UNREADABLE_MESSAGE = "No se pudo procesar el video. Probá con otro archivo."
_TOO_LONG_MESSAGE = f"El video puede durar {MAX_DURATION_SECONDS // 60} minutos como máximo"


async def process_video(source: Path, destination: Path, poster: Path, demuxer: str) -> None:
    """Writes `destination` (MP4) and `poster` (JPEG) from `source`, or raises
    `BusinessRuleViolationError` leaving neither behind.

    `demuxer` forces how ffmpeg reads the input instead of letting it guess
    from the content: a crafted "video" that is really a playlist could
    otherwise make ffmpeg read other files from the server.
    """
    async with _conversion_slot:
        # A thread rather than an asyncio subprocess: the latter isn't
        # supported by the event loop Uvicorn uses on Windows with --reload.
        await asyncio.to_thread(_convert, source, destination, poster, demuxer)


def _convert(source: Path, destination: Path, poster: Path, demuxer: str) -> None:
    input_args = ["-protocol_whitelist", "file", "-f", demuxer, "-i", str(source)]
    try:
        _ensure_valid_input(input_args)
        _run_checked(
            [
                *input_args,
                # Stops early on a file that doesn't declare its duration.
                "-t", str(MAX_DURATION_SECONDS + 1),
                # Capital V skips cover art; audio is optional.
                "-map", "0:V:0",
                "-map", "0:a:0?",
                "-vf",
                f"scale=w='min({MAX_DIMENSION},iw)':h='min({MAX_DIMENSION},ih)'"
                ":force_original_aspect_ratio=decrease:force_divisible_by=2",
                "-fpsmax", "30",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "26",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "96k",
                "-ac", "2",
                # Phone videos carry GPS coordinates; none of it gets published.
                "-map_metadata", "-1",
                # Index at the start, so playback begins before the full download.
                "-movflags", "+faststart",
                str(destination),
            ]
        )  # fmt: skip
        duration = _read_duration(_run(["-i", str(destination)]).stderr)
        if duration is not None and duration > MAX_DURATION_SECONDS + 0.5:
            raise BusinessRuleViolationError(_TOO_LONG_MESSAGE)
        # `thumbnail` picks a representative frame among the first second, so a
        # fade-in doesn't leave a black poster.
        _run_checked(
            ["-i", str(destination), "-vf", "thumbnail=30", "-frames:v", "1", "-q:v", "3",
             str(poster)]
        )  # fmt: skip
    except BaseException:
        destination.unlink(missing_ok=True)
        poster.unlink(missing_ok=True)
        raise


def _ensure_valid_input(input_args: list[str]) -> None:
    # With no output file ffmpeg exits with an error, but still prints what the
    # input contains.
    info = _run(input_args).stderr
    if "Video:" not in info:
        logger.warning("Rejected video upload: %s", info.strip())
        raise BusinessRuleViolationError(_UNREADABLE_MESSAGE)
    duration = _read_duration(info)
    if duration is not None and duration > MAX_DURATION_SECONDS + 0.5:
        raise BusinessRuleViolationError(_TOO_LONG_MESSAGE)


def _read_duration(ffmpeg_info: str) -> float | None:
    match = _DURATION_PATTERN.search(ffmpeg_info)
    if match is None:
        return None
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
    command = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-nostdin", "-y", *args]
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise BusinessRuleViolationError(
            "El video tardó demasiado en procesarse. Probá con uno más corto o liviano."
        ) from exc


def _run_checked(args: list[str]) -> None:
    result = _run(["-loglevel", "error", *args])
    if result.returncode != 0:
        logger.warning("ffmpeg failed: %s", result.stderr.strip())
        raise BusinessRuleViolationError(_UNREADABLE_MESSAGE)
