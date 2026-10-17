import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import DEFAULT_SECRET_KEY, get_settings
from app.core.exception_handlers import register_exception_handlers
from app.routes.api_router import api_router

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    if settings.secret_key == DEFAULT_SECRET_KEY:
        # Loud on purpose: this string is public (it's the code default,
        # committed to the repo), so anyone can forge a valid login token for
        # any user while it's in effect — a full auth bypass, not a
        # theoretical one. Fine for a throwaway local checkout; never for
        # anything reachable outside your own machine.
        logger.warning(
            "SECRET_KEY is still the default dev value — every session token this "
            "server issues can be forged by anyone who has read the source. Set a "
            "real SECRET_KEY in .env before this is reachable by anyone but you."
        )

    app = FastAPI(title=settings.app_name, debug=settings.debug)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router)

    settings.media_root.mkdir(parents=True, exist_ok=True)
    app.mount(settings.media_url, StaticFiles(directory=settings.media_root), name="media")

    # Compat: uploaded-image URLs saved while `API_BASE_URL=/api` (production)
    # are stored as `/api/media/...`. When such a DB (e.g. a prod backup) runs
    # locally, there is no Nginx stripping `/api`, so serve the same files here.
    app.mount(
        "/api/media",
        StaticFiles(directory=settings.media_root),
        name="api-media",
    )

    return app


app = create_app()
