from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class PurchaseModel(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    supplier_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_methods.id"), nullable=True
    )
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
