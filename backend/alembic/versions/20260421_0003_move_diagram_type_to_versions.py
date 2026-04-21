"""move diagram_type from diagrams to versions

Revision ID: 20260421_0003
Revises: 20260324_0002
Create Date: 2026-04-21 10:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260421_0003"
down_revision: Union[str, None] = "20260324_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


diagram_type_enum = sa.Enum("flowchart", "class", "sequence", "er", name="diagram_type_enum")


def upgrade() -> None:
    op.add_column(
        "versions",
        sa.Column(
            "diagram_type",
            diagram_type_enum,
            nullable=False,
            server_default="flowchart",
        ),
    )
    op.execute(
        """
        UPDATE versions
        SET diagram_type = (
          SELECT diagrams.diagram_type
          FROM diagrams
          WHERE diagrams.id = versions.diagram_id
        )
        """
    )
    op.alter_column("versions", "diagram_type", server_default=None)
    op.drop_column("diagrams", "diagram_type")


def downgrade() -> None:
    op.add_column(
        "diagrams",
        sa.Column(
            "diagram_type",
            diagram_type_enum,
            nullable=False,
            server_default="flowchart",
        ),
    )
    op.execute(
        """
        UPDATE diagrams
        SET diagram_type = COALESCE((
          SELECT vv.diagram_type
          FROM versions vv
          WHERE vv.diagram_id = diagrams.id
          ORDER BY vv.version_number DESC
          LIMIT 1
        ), 'flowchart')
        """
    )
    op.alter_column("diagrams", "diagram_type", server_default=None)
    op.drop_column("versions", "diagram_type")

