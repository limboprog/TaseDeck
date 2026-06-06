from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class Review(BaseModel):
    id: UUID
    user_id: UUID | None = None
    rating: int
    comment: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateReview(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = ""
