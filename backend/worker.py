import logging
import time

from app.core.config import settings
from app.db.init_db import init_db
from app.services.mcp_sync import sync_registry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    interval_seconds = settings.sync_interval_hours * 60 * 60
    init_db()

    while True:
        try:
            sync_registry()
        except Exception:
            logger.exception("MCP registry sync failed")

        logger.info("Next sync in %s hours", settings.sync_interval_hours)
        time.sleep(interval_seconds)


if __name__ == "__main__":
    main()
