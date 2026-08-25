from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class BrandSettingsModel(Base):
    """Single-row table — `id` is always 1. No existing pattern in this
    codebase for app-wide settings, so this is deliberately the simplest
    possible shape rather than a generic key-value store."""

    __tablename__ = "brand_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    logo_url: Mapped[str] = mapped_column(String(500), nullable=False)
