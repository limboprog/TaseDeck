CREATE TABLE IF NOT EXISTS mcp_servers (
    name TEXT PRIMARY KEY,
    title TEXT,
    description TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    has_local BOOLEAN NOT NULL DEFAULT FALSE,
    has_remote BOOLEAN NOT NULL DEFAULT FALSE,
    registry_payload JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers (name);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_has_local ON mcp_servers (has_local);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_has_remote ON mcp_servers (has_remote);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_title ON mcp_servers (title);

CREATE TABLE IF NOT EXISTS mcp_reviews (
    id UUID PRIMARY KEY,
    mcp_name TEXT NOT NULL REFERENCES mcp_servers(name) ON DELETE CASCADE,
    user_id UUID,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_reviews_mcp_name ON mcp_reviews (mcp_name);
