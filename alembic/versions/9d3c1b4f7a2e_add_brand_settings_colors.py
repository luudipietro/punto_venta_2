"""add brand settings colors

Revision ID: 9d3c1b4f7a2e
Revises: 3226fb5391c6
Create Date: 2026-08-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9d3c1b4f7a2e'
down_revision: Union[str, Sequence[str], None] = '3226fb5391c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('brand_settings', sa.Column('colors', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('brand_settings', 'colors')
