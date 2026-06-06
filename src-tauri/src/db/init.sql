CREATE TABLE IF NOT EXISTS mcp_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    server_type TEXT NOT NULL CHECK (server_type IN ('local', 'remote')),
    path TEXT,
    run_command TEXT NOT NULL DEFAULT '',
    json_config TEXT NOT NULL DEFAULT '{}',
    config_inputs TEXT NOT NULL DEFAULT '[]',
    config_values TEXT NOT NULL DEFAULT '{}',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_type ON mcp_servers (server_type);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers (name);

CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'cursor',
    config_dir_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_name ON agents (name);

CREATE TABLE IF NOT EXISTS graphs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_graphs_client_id ON graphs (client_id);

CREATE TABLE IF NOT EXISTS graph_server_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    graph_id INTEGER NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    mcp_server_id INTEGER NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    edge_enabled INTEGER NOT NULL DEFAULT 1 CHECK (edge_enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (graph_id, agent_id, mcp_server_id)
);

CREATE INDEX IF NOT EXISTS idx_graph_server_links_graph ON graph_server_links (graph_id);
CREATE INDEX IF NOT EXISTS idx_graph_server_links_agent ON graph_server_links (agent_id);
