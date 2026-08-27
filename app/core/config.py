from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Only ever meant as a zero-config convenience for a fresh local checkout —
# see the "known default JWT secret" warning `create_app()` logs when this is
# still in effect. Never rely on this value outside of local dev; a real
# deployment must set SECRET_KEY in its own .env (the app will still start
# without it, but every session it issues is forgeable by anyone who has
# read this file, which is public on GitHub).
DEFAULT_SECRET_KEY = "dev-secret-change-me"


class Settings(BaseSettings):
    """Application configuration, sourced from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "POS Backend"
    debug: bool = False

    # Async URL used by the application at runtime, e.g.:
    #   postgresql+asyncpg://user:password@localhost:5432/pos
    #   mysql+aiomysql://user:password@localhost:3306/pos
    database_url: str = "postgresql+asyncpg://pos:pos@localhost:5432/pos"

    # Origins allowed to call the API from a browser (the frontend's dev/prod URL).
    cors_origins: list[str] = ["http://localhost:5173"]

    # Local disk storage for uploaded images (e.g. product photos), served as
    # static files at media_url. No cloud storage dependency.
    media_root: Path = Path("media")
    media_url: str = "/media"

    # JWT signing — override via the SECRET_KEY env var in real deployments.
    secret_key: str = DEFAULT_SECRET_KEY
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 4


@lru_cache
def get_settings() -> Settings:
    return Settings()
