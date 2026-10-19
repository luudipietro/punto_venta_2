"""add social links to brand settings

Revision ID: a41c7e2b9d05
Revises: d9bccb77810b
Create Date: 2026-10-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a41c7e2b9d05'
down_revision: Union[str, Sequence[str], None] = 'd9bccb77810b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('brand_settings', sa.Column('social_links', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('brand_settings', 'social_links')
