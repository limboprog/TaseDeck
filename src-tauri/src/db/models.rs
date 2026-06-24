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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    #[serde(default)]
    pub id: i64,
    pub folder_path: String,
    pub name: String,
    pub icon_color: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub disk_sync_dirty: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyProjectInput {
    pub name: String,
    pub folder_path: String,
    pub icon_color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyPresetInput {
    pub name: String,
    #[serde(default)]
    pub mcp_server_ids: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBootstrapRequest {
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub legacy_projects: Vec<LegacyProjectInput>,
    #[serde(default)]
    pub legacy_presets: Vec<LegacyPresetInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBootstrapResult {
    pub completed: bool,
    pub skipped: bool,
    pub agents_discovered: usize,
    pub agents_created: usize,
    pub projects_discovered: usize,
    pub projects_upserted: usize,
    pub links_created: usize,
    pub presets_created: usize,
    pub assignments_created: usize,
    pub agent_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetRecord {
    #[serde(default)]
    pub id: i64,
    pub name: String,
    pub server_fingerprint: String,
    #[serde(default)]
    pub mcp_server_ids: Vec<i64>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBootstrapStatus {
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPresetServerDetail {
    pub server_key: String,
    pub server: McpServer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAssignmentDetail {
    pub preset_id: i64,
    pub preset_name: String,
    pub config_overrides: String,
    pub servers: Vec<ProjectPresetServerDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAgentAssignmentDetail {
    pub agent_id: i64,
    pub assignment: Option<ProjectAssignmentDetail>,
    pub has_custom_preset: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetailRecord {
    pub project: ProjectRecord,
    pub agents: Vec<AgentRecord>,
    pub default_assignment: Option<ProjectAssignmentDetail>,
    pub agent_assignments: Vec<ProjectAgentAssignmentDetail>,
    pub native_mcp_imported: bool,
    #[serde(default)]
    pub disk_sync_pending: bool,
    pub default_source_mcp_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageLogEntry {
    pub id: u64,
    pub mcp_name: String,
    pub tool_name: String,
    pub caller: String,
    pub success: bool,
    pub result: String,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<i64>,
}
