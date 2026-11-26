"""Converts an uploaded video into the single format the storefront serves.

Phones record large files in codecs not every browser can play (an iPhone
defaults to HEVC `.mov`), so every upload is re-encoded to H.264/AAC MP4 at the
requested `VideoQuality`, with a JPEG poster next to it. The ffmpeg binary
comes from the `imageio-ffmpeg` package, so there is nothing to install on the
host or in the Docker image.
"""

import asyncio
import logging
import re
import subprocess
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

import imageio_ffmpeg

from app.core.exceptions import BusinessRuleViolationError

logger = logging.getLogger(__name__)

MAX_DURATION_SECONDS = 120
# Kept under the 300s proxy timeout Nginx is configured with for this upload.
TIMEOUT_SECONDS = 280

# ffmpeg uses every core it can get — one conversion at a time keeps a small
# VPS responsive for the rest of the API.
_conversion_slot = asyncio.Semaphore(1)

_DURATION_PATTERN = re.compile(r"Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)")

_UNREADABLE_MESSAGE = "No se pudo procesar el video. Probá con otro archivo."
_TOO_LONG_MESSAGE = f"El video puede durar {MAX_DURATION_SECONDS // 60} minutos como máximo"


class VideoQuality(StrEnum):
    # Product videos: many per shop, shown small.
    STANDARD = "standard"
    # The hero banner: one or two per shop, shown across the whole screen.
    HIGH = "high"


@dataclass(frozen=True)
class _Encoding:
    max_dimension: int  # longest side; smaller videos are never upscaled
    crf: int  # lower is better; 18 is visually indistinguishable from the source
    preset: str
    max_fps: int
    audio_bitrate: str
    # Ceiling so a busy clip can't get arbitrarily heavy for a customer's phone.
    max_kbps: int | None = None


_ENCODINGS = {
    VideoQuality.STANDARD: _Encoding(1280, 26, "veryfast", 30, "96k"),
    VideoQuality.HIGH: _Encoding(1920, 18, "fast", 60, "192k", max_kbps=12_000),
}


async def process_video(
    source: Path,
    destination: Path,
    poster: Path,
    demuxer: str,
    quality: VideoQuality = VideoQuality.STANDARD,
) -> bool:
    """Writes `destination` (MP4) and `poster` (JPEG) from `source`, or raises
    `BusinessRuleViolationError` leaving neither behind. Returns whether the
    result has an audio track.

    `demuxer` forces how ffmpeg reads the input instead of letting it guess
    from the content: a crafted "video" that is really a playlist could
    otherwise make ffmpeg read other files from the server.
    """
    async with _conversion_slot:
        # A thread rather than an asyncio subprocess: the latter isn't
        # supported by the event loop Uvicorn uses on Windows with --reload.
        return await asyncio.to_thread(
            _convert, source, destination, poster, demuxer, _ENCODINGS[quality]
        )


def _convert(
    source: Path, destination: Path, poster: Path, demuxer: str, encoding: _Encoding
) -> bool:
    max_side = encoding.max_dimension
    bitrate_cap = (
        ["-maxrate", f"{encoding.max_kbps}k", "-bufsize", f"{2 * encoding.max_kbps}k"]
        if encoding.max_kbps
        else []
    )
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
                f"scale=w='min({max_side},iw)':h='min({max_side},ih)'"
                ":force_original_aspect_ratio=decrease:force_divisible_by=2",
                "-fpsmax", str(encoding.max_fps),
                "-c:v", "libx264",
                "-preset", encoding.preset,
                "-crf", str(encoding.crf),
                *bitrate_cap,
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", encoding.audio_bitrate,
                "-ac", "2",
                # Phone videos carry GPS coordinates; none of it gets published.
                "-map_metadata", "-1",
                # Index at the start, so playback begins before the full download.
                "-movflags", "+faststart",
                str(destination),
            ]
        )  # fmt: skip
        result_info = _run(["-i", str(destination)]).stderr
        duration = _read_duration(result_info)
        if duration is not None and duration > MAX_DURATION_SECONDS + 0.5:
            raise BusinessRuleViolationError(_TOO_LONG_MESSAGE)
        # `thumbnail` picks a representative frame among the first second, so a
        # fade-in doesn't leave a black poster.
        _run_checked(
            ["-i", str(destination), "-vf", "thumbnail=30", "-frames:v", "1", "-q:v", "2",
             str(poster)]
        )  # fmt: skip
        return "Audio:" in result_info
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
