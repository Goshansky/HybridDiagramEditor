from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.crud import (
    create_diagram,
    get_diagram_by_id,
    list_diagram_versions,
    list_diagrams,
    update_diagram,
)
from app.database import get_db
from app.models import User
from app.schemas import DiagramCreate, DiagramRead, DiagramUpdate, VersionRead

router = APIRouter(prefix="/diagrams", tags=["diagrams"])


@router.get("", response_model=list[DiagramRead])
def get_diagrams(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DiagramRead]:
    return list_diagrams(db, current_user.id)


@router.post("", response_model=DiagramRead, status_code=status.HTTP_201_CREATED)
def create_new_diagram(
    payload: DiagramCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DiagramRead:
    return create_diagram(db, current_user.id, payload)


@router.get("/{diagram_id}", response_model=DiagramRead)
def get_diagram(
    diagram_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DiagramRead:
    diagram = get_diagram_by_id(db, diagram_id, current_user.id)
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Диаграмма не найдена")
    return diagram


@router.put("/{diagram_id}", response_model=DiagramRead)
def update_existing_diagram(
    diagram_id: int,
    payload: DiagramUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DiagramRead:
    diagram = get_diagram_by_id(db, diagram_id, current_user.id)
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Диаграмма не найдена")
    return update_diagram(db, diagram, payload)


@router.get("/{diagram_id}/versions", response_model=list[VersionRead])
def get_versions(
    diagram_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[VersionRead]:
    diagram = get_diagram_by_id(db, diagram_id, current_user.id)
    if not diagram:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Диаграмма не найдена")
    return list_diagram_versions(db, diagram.id)
