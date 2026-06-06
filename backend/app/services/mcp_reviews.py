from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.mcp import McpReview, McpServer
from app.schemas.mcp import CreateReview, Review


def list_reviews(db: Session, mcp_name: str) -> list[Review]:
    rows = db.scalars(
        select(McpReview)
        .where(McpReview.mcp_name == mcp_name)
        .order_by(McpReview.created_at.desc())
    ).all()
    return [Review.model_validate(row) for row in rows]


def create_review(
    db: Session,
    mcp_name: str,
    payload: CreateReview,
    user_id: UUID | None = None,
) -> Review:
    server = db.get(McpServer, mcp_name)
    if server is None:
        raise LookupError(f"MCP server not found: {mcp_name}")

    row = McpReview(
        id=uuid4(),
        mcp_name=mcp_name,
        user_id=user_id,
        rating=payload.rating,
        comment=payload.comment.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return Review.model_validate(row)
