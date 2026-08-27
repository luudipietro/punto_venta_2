"""Minimal in-memory login rate limiter.

Keyed by client IP (not username) — limiting by username would let an
attacker lock a *known* legitimate user out just by throwing bad passwords
at their account from anywhere. In-memory and per-process by design: this
app runs as a single Uvicorn process for one shop (see CLAUDE.md), so there's
no multi-instance/Redis setup to share state across; a horizontally-scaled
deployment would need a shared store instead (Redis, DB table) for this to
still work correctly.
"""

import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 15 * 60

_failures: dict[str, list[float]] = defaultdict(list)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check_login_rate_limit(request: Request) -> None:
    key = _client_key(request)
    now = time.monotonic()
    attempts = [t for t in _failures[key] if now - t < _WINDOW_SECONDS]
    _failures[key] = attempts
    if len(attempts) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Demasiados intentos fallidos. Probá de nuevo en unos minutos.",
        )


def record_login_failure(request: Request) -> None:
    _failures[_client_key(request)].append(time.monotonic())


def clear_login_failures(request: Request) -> None:
    _failures.pop(_client_key(request), None)


def reset_all() -> None:
    """Test-only: clears every tracked key so one test's failed attempts
    can't bleed into another's expectations (module-level state persists for
    the whole pytest process otherwise)."""
    _failures.clear()
