from functools import lru_cache

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
