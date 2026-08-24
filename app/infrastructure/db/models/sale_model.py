from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, func
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
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id"), nullable=True, default=None
    )
