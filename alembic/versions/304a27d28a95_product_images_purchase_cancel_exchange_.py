"""product images, purchase cancel, exchange branch and date

Revision ID: 304a27d28a95
Revises: dfb1b80f15e5
Create Date: 2026-08-24 13:18:55.459256

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '304a27d28a95'
down_revision: Union[str, Sequence[str], None] = 'dfb1b80f15e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('product_images',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('product_id', sa.Integer(), nullable=False),
    sa.Column('url', sa.String(length=500), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    # branch_id starts nullable so existing exchange rows don't reject the
    # add-column step, gets backfilled from the parent sale's branch, then
    # tightened to NOT NULL — same reasoning as the server_default trick used
    # elsewhere for NOT NULL columns on tables with existing rows, but here
    # the value isn't a constant so it needs a real backfill query.
    op.add_column('exchanges', sa.Column('branch_id', sa.Integer(), nullable=True))
    op.execute(
        "UPDATE exchanges SET branch_id = sales.branch_id "
        "FROM sales WHERE sales.id = exchanges.sale_id"
    )
    op.alter_column('exchanges', 'branch_id', nullable=False)
    op.create_foreign_key(
        'fk_exchanges_branch_id_branches', 'exchanges', 'branches', ['branch_id'], ['id']
    )
    op.add_column('exchanges', sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False))

    op.add_column('purchases', sa.Column('cancelled_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('purchases', 'cancelled_at')
    op.drop_column('exchanges', 'created_at')
    op.drop_constraint('fk_exchanges_branch_id_branches', 'exchanges', type_='foreignkey')
    op.drop_column('exchanges', 'branch_id')
    op.drop_table('product_images')
