from sqlalchemy import select
from sqlalchemy.orm import Session

from app import crud, models, schemas


def test_create_diagram_creates_initial_version(db_session: Session, user_factory) -> None:
    user = user_factory(password_hash="irrelevant")
    payload = schemas.DiagramCreate(name="Main diagram", content="A->B", type="flowchart")

    diagram = crud.create_diagram(db_session, user.id, payload)

    versions = db_session.execute(
        select(models.Version).where(models.Version.diagram_id == diagram.id)
    ).scalars().all()
    assert diagram.user_id == user.id
    assert diagram.content == "A->B"
    assert len(versions) == 1
    assert versions[0].version_number == 1
    assert versions[0].content == "A->B"
    assert versions[0].diagram_type == "flowchart"


def test_update_diagram_with_content_adds_next_version(db_session: Session, user_factory) -> None:
    user = user_factory(password_hash="irrelevant")
    diagram = crud.create_diagram(
        db_session,
        user.id,
        schemas.DiagramCreate(name="D", content="v1", type="flowchart"),
    )

    updated = crud.update_diagram(
        db_session,
        diagram,
        schemas.DiagramUpdate(content="v2", diagram_type="class"),
    )

    versions = crud.list_diagram_versions(db_session, diagram.id)
    assert updated.content == "v2"
    assert updated.diagram_type == "class"
    assert [v.version_number for v in versions] == [2, 1]
    assert versions[0].content == "v2"
    assert versions[0].diagram_type == "class"


def test_update_diagram_without_content_does_not_add_version(db_session: Session, user_factory) -> None:
    user = user_factory(password_hash="irrelevant")
    diagram = crud.create_diagram(
        db_session,
        user.id,
        schemas.DiagramCreate(name="Old", content="same", type="flowchart"),
    )

    crud.update_diagram(db_session, diagram, schemas.DiagramUpdate(name="New name"))

    versions = crud.list_diagram_versions(db_session, diagram.id)
    assert len(versions) == 1
    assert versions[0].version_number == 1
    assert versions[0].content == "same"


def test_get_diagram_by_id_is_scoped_by_user(db_session: Session, user_factory) -> None:
    owner = user_factory(email="owner@example.com", password_hash="irrelevant")
    intruder = user_factory(email="intruder@example.com", password_hash="irrelevant")
    diagram = crud.create_diagram(
        db_session,
        owner.id,
        schemas.DiagramCreate(name="Private", content="x", type="flowchart"),
    )

    found_for_owner = crud.get_diagram_by_id(db_session, diagram.id, owner.id)
    found_for_intruder = crud.get_diagram_by_id(db_session, diagram.id, intruder.id)

    assert found_for_owner is not None
    assert found_for_intruder is None


def test_list_projects_returns_versions_count(db_session: Session, user_factory) -> None:
    user = user_factory(password_hash="irrelevant")
    diagram = crud.create_diagram(
        db_session,
        user.id,
        schemas.DiagramCreate(name="Project", content="v1", type="flowchart"),
    )
    crud.update_diagram(db_session, diagram, schemas.DiagramUpdate(content="v2"))
    crud.update_diagram(db_session, diagram, schemas.DiagramUpdate(content="v3"))

    projects = crud.list_projects(db_session, user.id)

    assert len(projects) == 1
    assert projects[0].id == diagram.id
    assert projects[0].versions_count == 3
