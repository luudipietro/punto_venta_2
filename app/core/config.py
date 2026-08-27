from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    secret_key: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 4


@lru_cache
def get_settings() -> Settings:
    return Settings()
