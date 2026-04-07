import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import auth, crud, schemas


def test_password_hash_and_verify_roundtrip() -> None:
    plain = "StrongPass123"
    hashed = auth.get_password_hash(plain)

    assert hashed != plain
    assert auth.verify_password(plain, hashed) is True
    assert auth.verify_password("wrong-pass", hashed) is False


def test_authenticate_user_success_and_failure(db_session: Session) -> None:
    password = "Password123"
    user_payload = schemas.UserCreate(email="login@example.com", password=password)
    crud.create_user(db_session, user_payload)

    ok = crud.authenticate_user(db_session, "login@example.com", password)
    bad_password = crud.authenticate_user(db_session, "login@example.com", "incorrect")
    missing = crud.authenticate_user(db_session, "missing@example.com", password)

    assert ok is not None
    assert bad_password is None
    assert missing is None


def test_get_current_user_valid_token(db_session: Session) -> None:
    created = crud.create_user(
        db_session,
        schemas.UserCreate(email="token@example.com", password="Password123"),
    )
    token = auth.create_access_token(str(created.id))

    current = auth.get_current_user(token=token, db=db_session)

    assert current.id == created.id
    assert current.email == "token@example.com"


def test_get_current_user_invalid_token_raises_401(db_session: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        auth.get_current_user(token="not-a-jwt", db=db_session)

    assert exc_info.value.status_code == 401


def test_change_user_password_requires_old_password(db_session: Session) -> None:
    user = crud.create_user(
        db_session,
        schemas.UserCreate(email="change@example.com", password="OldPassword1"),
    )

    changed = crud.change_user_password(db_session, user, "wrong-old", "NewPassword1")
    db_session.refresh(user)

    assert changed is False
    assert auth.verify_password("OldPassword1", user.hashed_password) is True


def test_change_user_password_updates_hash(db_session: Session) -> None:
    user = crud.create_user(
        db_session,
        schemas.UserCreate(email="changed@example.com", password="OldPassword1"),
    )

    changed = crud.change_user_password(db_session, user, "OldPassword1", "NewPassword1")
    db_session.refresh(user)

    assert changed is True
    assert auth.verify_password("NewPassword1", user.hashed_password) is True
    assert auth.verify_password("OldPassword1", user.hashed_password) is False


def test_user_create_allows_72_utf8_bytes() -> None:
    # Cyrillic char is 2 bytes in UTF-8: 36 * 2 == 72
    pwd = "я" * 36
    model = schemas.UserCreate(email="bytes-ok@example.com", password=pwd)
    assert model.password == pwd


def test_user_create_rejects_password_above_72_utf8_bytes() -> None:
    # 37 * 2 == 74 bytes, must fail custom validator.
    with pytest.raises(ValidationError):
        schemas.UserCreate(email="bytes-fail@example.com", password="я" * 37)


def test_password_change_request_rejects_new_password_above_72_utf8_bytes() -> None:
    with pytest.raises(ValidationError):
        schemas.PasswordChangeRequest(
            old_password="Valid123",
            new_password="я" * 37,
        )
