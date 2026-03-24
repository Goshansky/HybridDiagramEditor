"""add diagram type and project support

Revision ID: 20260324_0002
Revises: 20260323_0001
Create Date: 2026-03-24 12:10:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260324_0002"
down_revision: Union[str, None] = "20260323_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


diagram_type_enum = sa.Enum("flowchart", "class", "sequence", "er", name="diagram_type_enum")


def upgrade() -> None:
    bind = op.get_bind()
    diagram_type_enum.create(bind, checkfirst=True)
    op.add_column(
        "diagrams",
        sa.Column(
            "diagram_type",
            diagram_type_enum,
            nullable=False,
            server_default="flowchart",
        ),
    )
    op.execute("UPDATE diagrams SET diagram_type = 'flowchart' WHERE diagram_type IS NULL")
    op.alter_column("diagrams", "diagram_type", server_default=None)


def downgrade() -> None:
    op.drop_column("diagrams", "diagram_type")
    bind = op.get_bind()
    diagram_type_enum.drop(bind, checkfirst=True)
