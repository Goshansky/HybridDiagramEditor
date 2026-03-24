from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

DiagramType = Literal["flowchart", "class", "sequence", "er"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password_byte_length(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Пароль должен быть не длиннее 72 байт в UTF-8")
        return value


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class DiagramCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    content: str = Field(default="", max_length=200000)
    type: DiagramType = "flowchart"


class DiagramUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1)
    diagram_type: DiagramType | None = None


class DiagramRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    content: str
    diagram_type: DiagramType
    created_at: datetime
    updated_at: datetime


class VersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    diagram_id: int
    content: str
    version_number: int
    created_at: datetime


class ProjectItemRead(BaseModel):
    id: int
    name: str
    diagram_type: DiagramType
    updated_at: datetime
    versions_count: int


class RenameDiagramRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class PasswordChangeRequest(BaseModel):
    old_password: str = Field(min_length=6, max_length=72)
    new_password: str = Field(min_length=6, max_length=72)

    @field_validator("old_password", "new_password")
    @classmethod
    def validate_password_byte_length(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Пароль должен быть не длиннее 72 байт в UTF-8")
        return value
