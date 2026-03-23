from sqlalchemy import Select, desc, func, select
from sqlalchemy.orm import Session

from app.auth import get_password_hash, verify_password
from app.models import Diagram, User, Version
from app.schemas import DiagramCreate, DiagramUpdate, UserCreate


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
    diagram = Diagram(user_id=user_id, name=payload.name, content=payload.content)
    db.add(diagram)
    db.flush()

    first_version = Version(
        diagram_id=diagram.id,
        content=payload.content,
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
    if payload.name is not None:
        diagram.name = payload.name
    if payload.content is not None:
        diagram.content = payload.content
    db.add(diagram)
    db.flush()

    if payload.content is not None:
        next_version_stmt = (
            select(func.coalesce(func.max(Version.version_number), 0) + 1)
            .where(Version.diagram_id == diagram.id)
        )
        next_version = db.execute(next_version_stmt).scalar_one()
        db.add(
            Version(
                diagram_id=diagram.id,
                content=diagram.content,
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
