"""add customers table and sales customer_id

Revision ID: f571daee19e8
Revises: 304a27d28a95
Create Date: 2026-08-24 14:31:42.888065

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f571daee19e8'
down_revision: Union[str, Sequence[str], None] = '304a27d28a95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('customers',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('dni', sa.String(length=20), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dni')
    )
    op.add_column('sales', sa.Column('customer_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_sales_customer_id_customers', 'sales', 'customers', ['customer_id'], ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_sales_customer_id_customers', 'sales', type_='foreignkey')
    op.drop_column('sales', 'customer_id')
    op.drop_table('customers')
