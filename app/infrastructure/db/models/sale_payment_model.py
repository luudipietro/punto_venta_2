from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class SalePaymentModel(Base):
    __tablename__ = "sale_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False)
    payment_method_id: Mapped[int] = mapped_column(ForeignKey("payment_methods.id"), nullable=False)
    amount_without_surcharge: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_with_surcharge: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
