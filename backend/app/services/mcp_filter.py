from sqlalchemy import Select, or_, select

from app.models.mcp import McpServer

McpSource = str


def build_mcp_query(
    *,
    search: str | None,
    source: McpSource,
    cursor: str | None,
    limit: int,
) -> Select[tuple[McpServer]]:
    stmt = select(McpServer).order_by(McpServer.name.asc())

    if source == "local":
        stmt = stmt.where(McpServer.has_local.is_(True))
    elif source == "remote":
        stmt = stmt.where(McpServer.has_remote.is_(True))

    normalized = (search or "").strip()
    if normalized:
        pattern = f"%{normalized}%"
        stmt = stmt.where(
            or_(
                McpServer.name.ilike(pattern),
                McpServer.title.ilike(pattern),
                McpServer.description.ilike(pattern),
            )
        )

    if cursor:
        stmt = stmt.where(McpServer.name > cursor)

    return stmt.limit(limit)
