use crate::agents::provider_for;
use crate::db::Database;
use crate::services::TopologyAggregatorConfig;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub fn mcp_servers_root_for_kind(kind: &str) -> &'static str {
    match kind {
        "cursor" => "mcpServers",
        _ => "servers",
    }
}

pub fn topology_mcp_entry_key(client_id: &str) -> String {
    format!("tasedeck-topology-{client_id}")
}

pub fn aggregator_config_to_entry(config: &TopologyAggregatorConfig) -> Value {
    let mut entry = json!({
        "command": config.command,
        "args": config.args,
    });
    if !config.env.is_empty() {
        entry["env"] = json!(config.env);
    }
    entry
}

pub fn agent_mcp_json_path(agent: &crate::db::AgentRecord) -> PathBuf {
    PathBuf::from(agent.config_dir_path.trim()).join("mcp.json")
}

pub fn upsert_topology_in_agent_mcp_json(
    agent: &crate::db::AgentRecord,
    client_id: &str,
    aggregator: &TopologyAggregatorConfig,
) -> Result<PathBuf, String> {
    let path = agent_mcp_json_path(agent);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let servers_key = mcp_servers_root_for_agent_kind(&agent.kind);
    let entry_key = topology_mcp_entry_key(client_id);
    let entry = aggregator_config_to_entry(aggregator);

    let mut root = read_mcp_json_object(&path)?;
    let servers = root
        .entry(servers_key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));

    let Some(servers_map) = servers.as_object_mut() else {
        return Err(format!("{servers_key} in mcp.json must be an object"));
    };

    servers_map.insert(entry_key, entry);
    write_mcp_json(&path, &root)?;
    Ok(path)
}

pub fn remove_topology_from_agent_mcp_json(
    agent: &crate::db::AgentRecord,
    client_id: &str,
) -> Result<Option<PathBuf>, String> {
    let path = agent_mcp_json_path(agent);
    if !path.is_file() {
        return Ok(None);
    }

    let servers_key = mcp_servers_root_for_agent_kind(&agent.kind);
    let entry_key = topology_mcp_entry_key(client_id);

    let mut root = read_mcp_json_object(&path)?;
    let Some(servers) = root.get_mut(servers_key).and_then(Value::as_object_mut) else {
        return Ok(Some(path));
    };

    servers.remove(&entry_key);
    write_mcp_json(&path, &root)?;
    Ok(Some(path))
}

pub fn sync_topology_mcp_json_for_graph(
    db: &Database,
    client_id: &str,
    name: &str,
    aggregator: Option<&TopologyAggregatorConfig>,
) -> Result<Vec<String>, String> {
    let graph_state = db
        .get_graph_state_by_client_id(client_id, name)
        .map_err(|error| error.to_string())?;

    let mut agent_ids = graph_state
        .links
        .iter()
        .filter(|link| link.edge_enabled)
        .map(|link| link.agent_id)
        .collect::<Vec<_>>();
    agent_ids.sort_unstable();
    agent_ids.dedup();

    let mut written = Vec::new();

    for agent_id in agent_ids {
        let agent = db
            .get_agent_record(agent_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("agent {agent_id} not found"))?;

        if !crate::agents::is_config_dir_valid(&agent.config_dir_path) {
            continue;
        }

        let path = match aggregator {
            Some(config) => upsert_topology_in_agent_mcp_json(&agent, client_id, config)?,
            None => remove_topology_from_agent_mcp_json(&agent, client_id)?
                .unwrap_or_else(|| agent_mcp_json_path(&agent)),
        };

        written.push(path.display().to_string());
    }

    Ok(written)
}

pub fn default_mcp_json_template(kind: &str) -> String {
    let root_key = mcp_servers_root_for_kind(kind);
    format!("{{\n  \"{root_key}\": {{}}\n}}\n")
}

pub fn ensure_agent_mcp_json(agent_kind: &str, config_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(config_dir).map_err(|error| error.to_string())?;
    let path = config_dir.join("mcp.json");
    if !path.is_file() {
        fs::write(&path, default_mcp_json_template(agent_kind)).map_err(|error| error.to_string())?;
    }
    Ok(path)
}

/// Resolve servers root key using built-in provider metadata when available.
pub fn mcp_servers_root_for_agent_kind(kind: &str) -> &'static str {
    if let Ok(provider) = provider_for(kind) {
        return provider.mcp_json_servers_key();
    }
    mcp_servers_root_for_kind(kind)
}

fn read_mcp_json_object(path: &Path) -> Result<Map<String, Value>, String> {
    if !path.is_file() {
        return Ok(Map::new());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let value: Value =
        serde_json::from_str(&raw).map_err(|error| format!("invalid mcp.json: {error}"))?;

    value
        .as_object()
        .cloned()
        .ok_or_else(|| "mcp.json root must be an object".to_string())
}

fn write_mcp_json(path: &Path, root: &Map<String, Value>) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(root).map_err(|error| error.to_string())?;
    fs::write(path, format!("{payload}\n")).map_err(|error| error.to_string())
}
