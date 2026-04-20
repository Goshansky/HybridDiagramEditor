from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.crud import change_user_password
from app.database import get_db
from app.models import Diagram, User, Version
from app.schemas import (
    PasswordChangeRequest,
    UserRead,
    UserStatsRead,
    VersionActivityItem,
    VersionActivityRead,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)) -> UserRead:
    return current_user


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def update_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    changed = change_user_password(
        db=db,
        user=current_user,
        old_password=payload.old_password,
        new_password=payload.new_password,
    )
    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Старый пароль указан неверно",
        )


@router.get("/stats", response_model=UserStatsRead)
def get_user_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserStatsRead:
    total_diagrams = db.scalar(
        select(func.count(Diagram.id)).where(Diagram.user_id == current_user.id),
    ) or 0
    total_versions = db.scalar(
        select(func.count(Version.id))
        .select_from(Version)
        .join(Diagram, Diagram.id == Version.diagram_id)
        .where(Diagram.user_id == current_user.id),
    ) or 0
    last_activity = db.scalar(
        select(func.max(Diagram.updated_at)).where(Diagram.user_id == current_user.id),
    )

    return UserStatsRead(
        totalDiagrams=int(total_diagrams),
        totalVersions=int(total_versions),
        lastActivityDate=last_activity,
    )


def _range_days_for_period(period: Literal["day", "week", "month", "year"]) -> int:
    if period == "day":
        return 1
    if period == "week":
        return 7
    if period == "month":
        return 30
    return 365


@router.get("/version-activity", response_model=VersionActivityRead)
def get_version_activity(
    period: Literal["day", "week", "month", "year"] = Query(default="year"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VersionActivityRead:
    now = datetime.now(timezone.utc)
    days = _range_days_for_period(period)
    start_dt = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    end_dt = now
    if period == "day":
        hourly_rows = db.execute(
            select(Version.created_at)
            .select_from(Version)
            .join(Diagram, Diagram.id == Version.diagram_id)
            .where(
                Diagram.user_id == current_user.id,
                Version.created_at >= start_dt,
                Version.created_at <= end_dt,
            )
            .order_by(Version.created_at),
        ).all()
        hourly_counts: dict[datetime, int] = defaultdict(int)
        for r in hourly_rows:
            raw_dt = r.created_at
            if raw_dt.tzinfo is None:
                dt_utc = raw_dt.replace(tzinfo=timezone.utc)
            else:
                dt_utc = raw_dt.astimezone(timezone.utc)
            bucket_dt = dt_utc.replace(minute=0, second=0, microsecond=0)
            hourly_counts[bucket_dt] += 1
        rows = [
            {"bucket_dt": bucket_dt, "bucket_count": count}
            for bucket_dt, count in sorted(hourly_counts.items(), key=lambda x: x[0])
        ]
        granularity: Literal["hour", "day"] = "hour"
    else:
        rows = db.execute(
            select(
                func.date(Version.created_at).label("bucket_dt"),
                func.count(Version.id).label("bucket_count"),
            )
            .select_from(Version)
            .join(Diagram, Diagram.id == Version.diagram_id)
            .where(
                Diagram.user_id == current_user.id,
                Version.created_at >= start_dt,
                Version.created_at <= end_dt,
            )
            .group_by(func.date(Version.created_at))
            .order_by(func.date(Version.created_at)),
        ).all()
        granularity = "day"

    items: list[VersionActivityItem] = []
    for r in rows:
        raw_bucket = r["bucket_dt"] if isinstance(r, dict) else r.bucket_dt
        if isinstance(raw_bucket, datetime):
            bucket_value = raw_bucket.astimezone(timezone.utc).replace(tzinfo=None).isoformat(timespec="hours")
        elif hasattr(raw_bucket, "year") and hasattr(raw_bucket, "month") and hasattr(raw_bucket, "day"):
            bucket_value = raw_bucket.isoformat()
        else:
            bucket_value = str(raw_bucket)
        raw_count = r["bucket_count"] if isinstance(r, dict) else r.bucket_count
        items.append(
            VersionActivityItem(
                bucket=bucket_value,
                count=int(raw_count),
            ),
        )

    return VersionActivityRead(
        period=period,
        granularity=granularity,
        startDate=start_dt.date(),
        endDate=end_dt.date(),
        items=items,
    )
