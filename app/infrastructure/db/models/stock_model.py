from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class StockModel(Base):
    __tablename__ = "stocks"
    __table_args__ = (
        UniqueConstraint("product_id", "color_id", "size_id", "branch_id", name="uq_stock_variant"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    color_id: Mapped[int] = mapped_column(ForeignKey("colors.id"), nullable=False)
    size_id: Mapped[int] = mapped_column(ForeignKey("sizes.id"), nullable=False)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
