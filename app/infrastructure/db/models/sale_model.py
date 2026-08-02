from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class SaleModel(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    promotion_discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    discount_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
