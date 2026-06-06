from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.mcp import CreateReview, Review
from app.services.mcp_catalog import list_mcp_servers
from app.services.mcp_reviews import create_review, list_reviews

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/servers")
def get_mcp_servers(
    search: str | None = Query(default=None, alias="search"),
    source: Literal["all", "local", "remote"] = Query(default="all"),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    return list_mcp_servers(
        db,
        search=search,
        source=source,
        cursor=cursor,
        limit=limit,
    )


@router.get("/servers/{name:path}/reviews", response_model=list[Review])
def get_mcp_reviews(name: str, db: Session = Depends(get_db)) -> list[Review]:
    return list_reviews(db, name)


@router.post("/servers/{name:path}/reviews", response_model=Review)
def post_mcp_review(
    name: str,
    payload: CreateReview,
    db: Session = Depends(get_db),
) -> Review:
    try:
        return create_review(db, name, payload)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
