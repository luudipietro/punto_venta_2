from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model. Import all models before
    running Alembic autogenerate so they register on this metadata."""
