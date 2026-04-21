from sqlalchemy import Select, and_, desc, func, select
from sqlalchemy.orm import Session

from app.auth import get_password_hash, verify_password
from app.models import Diagram, User, Version, utcnow
from app.schemas import DiagramCreate, DiagramUpdate, ProjectItemRead, UserCreate


def get_user_by_email(db: Session, email: str) -> User | None:
    stmt: Select[tuple[User]] = select(User).where(User.email == email)
    return db.execute(stmt).scalar_one_or_none()


def create_user(db: Session, payload: UserCreate) -> User:
    user = User(email=payload.email, hashed_password=get_password_hash(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def list_diagrams(db: Session, user_id: int) -> list[Diagram]:
    stmt: Select[tuple[Diagram]] = (
        select(Diagram)
        .where(Diagram.user_id == user_id)
        .order_by(desc(Diagram.updated_at))
    )
    return list(db.execute(stmt).scalars().all())


def create_diagram(db: Session, user_id: int, payload: DiagramCreate) -> Diagram:
    initial_content = payload.content or ""
    diagram = Diagram(
        user_id=user_id,
        name=payload.name,
        content=initial_content,
    )
    db.add(diagram)
    db.flush()

    first_version = Version(
        diagram_id=diagram.id,
        content=initial_content,
        diagram_type=payload.type,
        version_number=1,
    )
    db.add(first_version)
    db.commit()
    db.refresh(diagram)
    return diagram


def get_diagram_by_id(db: Session, diagram_id: int, user_id: int) -> Diagram | None:
    stmt: Select[tuple[Diagram]] = select(Diagram).where(
        Diagram.id == diagram_id,
        Diagram.user_id == user_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def update_diagram(
    db: Session,
    diagram: Diagram,
    payload: DiagramUpdate,
) -> Diagram:
    latest_type_stmt = (
        select(Version.diagram_type)
        .where(Version.diagram_id == diagram.id)
        .order_by(desc(Version.version_number))
        .limit(1)
    )
    latest_type = db.execute(latest_type_stmt).scalar_one_or_none() or "flowchart"
    next_type = payload.diagram_type if payload.diagram_type is not None else latest_type

    if payload.name is not None:
        diagram.name = payload.name
    if payload.content is not None:
        diagram.content = payload.content
    if payload.diagram_type is not None and payload.content is None and payload.name is None:
        diagram.updated_at = utcnow()
    db.add(diagram)
    db.flush()

    if payload.content is not None or payload.diagram_type is not None:
        next_version_stmt = (
            select(func.coalesce(func.max(Version.version_number), 0) + 1)
            .where(Version.diagram_id == diagram.id)
        )
        next_version = db.execute(next_version_stmt).scalar_one()
        next_content = payload.content if payload.content is not None else diagram.content
        db.add(
            Version(
                diagram_id=diagram.id,
                content=next_content,
                diagram_type=next_type,
                version_number=next_version,
            )
        )

    db.commit()
    db.refresh(diagram)
    return diagram


def list_diagram_versions(db: Session, diagram_id: int) -> list[Version]:
    stmt: Select[tuple[Version]] = (
        select(Version)
        .where(Version.diagram_id == diagram_id)
        .order_by(desc(Version.version_number))
    )
    return list(db.execute(stmt).scalars().all())


def list_projects(db: Session, user_id: int) -> list[ProjectItemRead]:
    latest_version_subq = (
        select(
            Version.diagram_id.label("diagram_id"),
            func.max(Version.version_number).label("max_version"),
        )
        .group_by(Version.diagram_id)
        .subquery()
    )
    latest_type_subq = (
        select(
            Version.diagram_id.label("diagram_id"),
            Version.diagram_type.label("diagram_type"),
        )
        .join(
            latest_version_subq,
            and_(
                latest_version_subq.c.diagram_id == Version.diagram_id,
                latest_version_subq.c.max_version == Version.version_number,
            ),
        )
        .subquery()
    )

    stmt = (
        select(
            Diagram.id,
            Diagram.name,
            latest_type_subq.c.diagram_type,
            Diagram.updated_at,
            func.count(Version.id).label("versions_count"),
        )
        .outerjoin(latest_type_subq, latest_type_subq.c.diagram_id == Diagram.id)
        .outerjoin(Version, Version.diagram_id == Diagram.id)
        .where(Diagram.user_id == user_id)
        .group_by(Diagram.id, latest_type_subq.c.diagram_type)
        .order_by(desc(Diagram.updated_at))
    )
    rows = db.execute(stmt).all()
    return [
        ProjectItemRead(
            id=row.id,
            name=row.name,
            diagram_type=row.diagram_type or "flowchart",
            updated_at=row.updated_at,
            versions_count=int(row.versions_count or 0),
        )
        for row in rows
    ]


def rename_diagram(db: Session, diagram: Diagram, name: str) -> Diagram:
    diagram.name = name
    db.add(diagram)
    db.commit()
    db.refresh(diagram)
    return diagram


def delete_diagram(db: Session, diagram: Diagram) -> None:
    db.delete(diagram)
    db.commit()


def change_user_password(db: Session, user: User, old_password: str, new_password: str) -> bool:
    if not verify_password(old_password, user.hashed_password):
        return False
    user.hashed_password = get_password_hash(new_password)
    db.add(user)
    db.commit()
    return True
