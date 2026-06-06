use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpServerType {
    Local,
    Remote,
}

impl McpServerType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Remote => "remote",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "local" => Some(Self::Local),
            "remote" => Some(Self::Remote),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    #[serde(default)]
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub server_type: McpServerType,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub run_command: String,
    #[serde(default)]
    pub json_config: String,
    #[serde(default)]
    pub config_inputs: String,
    #[serde(default)]
    pub config_values: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallMcpLocalRequest {
    pub install_command: String,
    pub server: McpServer,
}

impl McpServer {
    pub fn is_new(&self) -> bool {
        self.id == 0
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecord {
    #[serde(default)]
    pub id: i64,
    pub name: String,
    #[serde(default = "default_agent_kind")]
    pub kind: String,
    pub config_dir_path: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

fn default_agent_kind() -> String {
    "cursor".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRecord {
    #[serde(default)]
    pub id: i64,
    pub client_id: String,
    pub name: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphServerLink {
    #[serde(default)]
    pub id: i64,
    pub graph_id: i64,
    pub agent_id: i64,
    pub mcp_server_id: i64,
    pub active: bool,
    pub edge_enabled: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphLinkInput {
    pub agent_id: i64,
    pub mcp_server_id: i64,
    #[serde(default = "default_true")]
    pub active: bool,
    #[serde(default = "default_true")]
    pub edge_enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphState {
    pub graph: GraphRecord,
    pub links: Vec<GraphServerLink>,
}

impl AgentRecord {
    pub fn is_new(&self) -> bool {
        self.id == 0
    }
}
