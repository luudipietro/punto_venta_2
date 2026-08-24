"""product optional brand/category, purchase payment status

Revision ID: dfb1b80f15e5
Revises: e5d4ba9f63f5
Create Date: 2026-08-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dfb1b80f15e5'
down_revision: Union[str, Sequence[str], None] = 'e5d4ba9f63f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('products', 'category_id', nullable=True)
    op.alter_column('products', 'brand_id', nullable=True)

    op.add_column('purchases', sa.Column('payment_method_id', sa.Integer(), nullable=True))
    op.add_column('purchases', sa.Column('payment_date', sa.Date(), nullable=True))
    # server_default below is temporary, just so the NOT NULL add-column step
    # doesn't fail against existing rows — dropped right after, same pattern
    # used for payment_methods.is_cash in 25abd4b01c30.
    op.add_column(
        'purchases',
        sa.Column('is_paid', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column('purchases', 'is_paid', server_default=None)
    op.create_foreign_key(
        'fk_purchases_payment_method_id_payment_methods',
        'purchases',
        'payment_methods',
        ['payment_method_id'],
        ['id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'fk_purchases_payment_method_id_payment_methods', 'purchases', type_='foreignkey'
    )
    op.drop_column('purchases', 'is_paid')
    op.drop_column('purchases', 'payment_date')
    op.drop_column('purchases', 'payment_method_id')

    op.alter_column('products', 'brand_id', nullable=False)
    op.alter_column('products', 'category_id', nullable=False)
