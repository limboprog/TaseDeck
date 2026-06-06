import logging
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.mcp import McpServer
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

REGISTRY_PAGE_SIZE = 100
META_KEY = "io.modelcontextprotocol.registry/official"


def has_local_packages(server: dict[str, Any]) -> bool:
    packages = server.get("packages")
    return isinstance(packages, list) and len(packages) > 0


def has_remote_connections(server: dict[str, Any]) -> bool:
    remotes = server.get("remotes")
    return isinstance(remotes, list) and len(remotes) > 0


def normalize_registry_item(item: dict[str, Any]) -> dict[str, Any]:
    server = item["server"]
    meta = item.get("_meta", {}).get(META_KEY, {})
    name = server["name"]

    return {
        "name": name,
        "title": server.get("title"),
        "description": server.get("description") or "",
        "version": server.get("version") or "",
        "has_local": has_local_packages(server),
        "has_remote": has_remote_connections(server),
        "registry_payload": {"server": server, "meta": meta},
        "synced_at": datetime.now(UTC),
    }


def fetch_registry_page(
    client: httpx.Client,
    *,
    cursor: str | None = None,
    limit: int = REGISTRY_PAGE_SIZE,
) -> dict[str, Any]:
    url = f"{settings.registry_base_url.rstrip('/')}/v0/servers"
    params: dict[str, str] = {
        "limit": str(limit),
        "version": "latest",
    }
    if cursor:
        params["cursor"] = cursor

    response = client.get(url, params=params, headers={"Accept": "application/json"})
    response.raise_for_status()
    return response.json()


def upsert_server(db: Session, payload: dict[str, Any]) -> None:
    existing = db.get(McpServer, payload["name"])
    if existing is None:
        db.add(McpServer(**payload))
        return

    existing.title = payload["title"]
    existing.description = payload["description"]
    existing.version = payload["version"]
    existing.has_local = payload["has_local"]
    existing.has_remote = payload["has_remote"]
    existing.registry_payload = payload["registry_payload"]
    existing.synced_at = payload["synced_at"]


def sync_registry() -> int:
    logger.info("Starting MCP registry sync from %s", settings.registry_base_url)
    synced = 0
    cursor: str | None = None

    with httpx.Client(timeout=60.0) as client, SessionLocal() as db:
        while True:
            data = fetch_registry_page(client, cursor=cursor)
            servers = data.get("servers", [])
            if not servers:
                break

            for item in servers:
                upsert_server(db, normalize_registry_item(item))
                synced += 1

            db.commit()

            cursor = data.get("metadata", {}).get("nextCursor")
            if not cursor:
                break

    logger.info("MCP registry sync finished, upserted %s servers", synced)
    return synced
