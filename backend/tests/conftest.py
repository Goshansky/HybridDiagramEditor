from collections.abc import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    Base.metadata.create_all(bind=engine)
    try:
        with TestingSessionLocal() as session:
            yield session
    finally:
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def user_factory(db_session: Session):
    def _create_user(email: str = "user@example.com", password_hash: str = "hashed") -> models.User:
        user = models.User(email=email, hashed_password=password_hash)
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return _create_user
