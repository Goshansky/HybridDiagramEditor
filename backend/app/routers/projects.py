from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.crud import list_projects
from app.database import get_db
from app.models import User
from app.schemas import ProjectItemRead

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectItemRead])
def get_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProjectItemRead]:
    return list_projects(db, current_user.id)
