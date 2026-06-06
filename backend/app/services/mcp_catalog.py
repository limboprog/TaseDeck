from sqlalchemy.orm import Session

from app.models.mcp import McpServer
from app.services.mcp_filter import build_mcp_query


def row_to_entry(row: McpServer) -> dict:
    payload = row.registry_payload or {}
    server = payload.get("server") or {"name": row.name, "version": row.version}
    meta = payload.get("meta") or {}
    return {"server": server, "meta": meta}


def list_mcp_servers(
    db: Session,
    *,
    search: str | None,
    source: str,
    cursor: str | None,
    limit: int,
) -> dict:
    bounded_limit = max(1, min(limit, 100))
    rows = db.scalars(
        build_mcp_query(
            search=search,
            source=source,
            cursor=cursor,
            limit=bounded_limit + 1,
        )
    ).all()

    has_more = len(rows) > bounded_limit
    page_rows = rows[:bounded_limit]
    servers = [row_to_entry(row) for row in page_rows]
    next_cursor = page_rows[-1].name if has_more and page_rows else None

    return {
        "servers": servers,
        "metadata": {
            "count": len(servers),
            "nextCursor": next_cursor,
        },
    }
