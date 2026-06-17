use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTransportCatalogEntry {
    pub id: String,
    pub label: String,
}

/// Built-in MCP run-command transport types (stdio, SSE, streamable HTTP).
pub fn list_mcp_run_transports() -> Vec<McpTransportCatalogEntry> {
    vec![
        McpTransportCatalogEntry {
            id: "stdio".to_string(),
            label: "stdio".to_string(),
        },
        McpTransportCatalogEntry {
            id: "streamable-http".to_string(),
            label: "Streamable HTTP".to_string(),
        },
        McpTransportCatalogEntry {
            id: "sse".to_string(),
            label: "SSE".to_string(),
        },
    ]
}
