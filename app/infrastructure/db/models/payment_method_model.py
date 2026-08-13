from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class PaymentMethodModel(Base):
    __tablename__ = "payment_methods"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    surcharge_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    is_cash: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
