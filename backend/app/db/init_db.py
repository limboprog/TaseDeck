import logging

from app.models.mcp import McpReview, McpServer  # noqa: F401
from app.db.session import Base, engine

logger = logging.getLogger(__name__)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    logger.info("Database schema ensured")
