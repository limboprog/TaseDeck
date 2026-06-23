use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigLocation {
    pub config_dir: String,
    pub mcp_json_path: String,
    pub dir_exists: bool,
    pub mcp_json_exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCatalogEntry {
    pub kind: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigInfo {
    pub kind: String,
    pub label: String,
    pub candidates: Vec<McpConfigLocation>,
    /// Resolved location: existing `mcp.json`, else first existing dir, else first candidate.
    pub active: Option<McpConfigLocation>,
}

impl McpConfigLocation {
    pub fn from_dir_and_file(config_dir: PathBuf, file_name: &str) -> Self {
        let mcp_json_path = config_dir.join(file_name);
        Self {
            dir_exists: config_dir.is_dir(),
            mcp_json_exists: mcp_json_path.is_file(),
            config_dir: path_to_string(config_dir),
            mcp_json_path: path_to_string(mcp_json_path),
        }
    }

    pub fn from_paths(config_dir: PathBuf) -> Self {
        Self::from_dir_and_file(config_dir, "mcp.json")
    }
}

pub fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}
