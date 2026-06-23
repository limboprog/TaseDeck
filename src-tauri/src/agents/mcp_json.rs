use crate::agents::provider_for;
use crate::agents::project_mcp::{find_project_mcp_config, project_mcp_candidate_paths};
use crate::db::Database;
use crate::db::McpServer;
use crate::services::{
    is_tasedeck_proxy_entry, mcp_server_for_runtime, prepare_proxy_entry, McpProxyServerEntry,
    TopologyAggregatorConfig, TASEDECK_PROXY_ENTRY_MARKER,
};
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use toml::value::Table as TomlTable;
use toml::Value as TomlValue;

pub fn mcp_servers_root_for_kind(kind: &str) -> &'static str {
    match kind {
        "cursor" | "vscode" | "windsurf" => "mcpServers",
        "opencode" => "mcp",
        _ => "servers",
    }
}

pub const TOPOLOGY_MCP_ENTRY_KEY: &str = "tasedeck-topology";

pub fn topology_mcp_entry_key(_client_id: &str) -> String {
    TOPOLOGY_MCP_ENTRY_KEY.to_string()
}

pub fn is_tasedeck_topology_entry_key(name: &str) -> bool {
    name == TOPOLOGY_MCP_ENTRY_KEY || name.starts_with("tasedeck-topology-")
}

/// MCP config key shown to the agent — market/catalog name, not internal `server-0` ids.
pub fn mcp_entry_key_for_server(server: &McpServer) -> String {
    if let Ok(root) = serde_json::from_str::<Value>(&server.json_config) {
        if let Some(map) = root.get("mcpServers").and_then(Value::as_object) {
            if map.len() == 1 {
                if let Some(key) = map.keys().next() {
                    let trimmed = key.trim();
                    if !trimmed.is_empty() {
                        return trimmed.to_string();
                    }
                }
            }
        }
    }

    let name = server.name.trim();
    if !name.is_empty() {
        return name.to_string();
    }

    format!("mcp-server-{}", server.id)
}

pub fn uniquify_mcp_entry_key(base: &str, used: &mut HashSet<String>) -> String {
    let base = base.trim();
    let base = if base.is_empty() { "mcp-server" } else { base };
    if used.insert(base.to_string()) {
        return base.to_string();
    }

    let mut index = 2;
    loop {
        let candidate = format!("{base}-{index}");
        if used.insert(candidate.clone()) {
            return candidate;
        }
        index += 1;
    }
}

fn strip_tasedeck_topology_json_entries(servers_map: &mut Map<String, Value>) {
    servers_map.retain(|key, _| !is_tasedeck_topology_entry_key(key));
}

pub fn aggregator_config_to_entry(config: &TopologyAggregatorConfig) -> Value {
    let mut entry = json!({
        "command": config.command,
        "args": config.args,
    });
    let public_env: Map<String, Value> = config
        .env
        .iter()
        .filter(|(key, _)| env_key_exports_to_agent(key))
        .map(|(key, value)| (key.clone(), json!(value)))
        .collect();
    if !public_env.is_empty() {
        entry["env"] = Value::Object(public_env);
    }
    entry
}

fn env_key_exports_to_agent(key: &str) -> bool {
    matches!(
        key,
        "TASEDECK_SERVER_CONFIG" | "TASEDECK_SERVER_ID" | "TASEDECK_SERVER_NAME"
    ) || (!key.starts_with("TASEDECK_") && key != TASEDECK_PROXY_ENTRY_MARKER)
}

fn aggregator_config_to_opencode_entry(config: &TopologyAggregatorConfig) -> Value {
    let mut command = vec![config.command.clone()];
    command.extend(config.args.clone());
    let mut entry = json!({
        "type": "local",
        "command": command,
        "enabled": true,
    });
    if !config.env.is_empty() {
        entry["environment"] = json!(config.env);
    }
    entry
}

pub fn agent_mcp_json_path(agent: &crate::db::AgentRecord) -> PathBuf {
    agent_mcp_config_path(agent)
}

pub fn agent_mcp_config_path(agent: &crate::db::AgentRecord) -> PathBuf {
    let config_dir = PathBuf::from(agent.config_dir_path.trim());
    let file_name = provider_for(&agent.kind)
        .map(|provider| provider.mcp_config_file_name().to_string())
        .unwrap_or_else(|_| "mcp.json".to_string());
    config_dir.join(file_name)
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

    let entry_key = topology_mcp_entry_key(client_id);

    if agent.kind == "codex-cli" {
        upsert_topology_in_codex_toml(&path, &entry_key, aggregator)?;
        return Ok(path);
    }

    let servers_key = mcp_servers_root_for_agent_kind(&agent.kind);
    let entry = if agent.kind == "opencode" {
        aggregator_config_to_opencode_entry(aggregator)
    } else {
        aggregator_config_to_entry(aggregator)
    };

    let mut root = read_mcp_json_object(&path)?;
    let servers = root
        .entry(servers_key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));

    let Some(servers_map) = servers.as_object_mut() else {
        return Err(format!("{servers_key} in agent config must be an object"));
    };

    strip_tasedeck_topology_json_entries(servers_map);
    servers_map.insert(entry_key, entry);
    write_mcp_json(&path, &root)?;
    Ok(path)
}

pub fn remove_topology_from_agent_mcp_json(
    agent: &crate::db::AgentRecord,
    _client_id: &str,
) -> Result<Option<PathBuf>, String> {
    let path = agent_mcp_json_path(agent);
    if !path.is_file() {
        return Ok(None);
    }

    if agent.kind == "codex-cli" {
        remove_topology_from_codex_toml(&path)?;
        return Ok(Some(path));
    }

    let servers_key = mcp_servers_root_for_agent_kind(&agent.kind);

    let mut root = read_mcp_json_object(&path)?;
    let Some(servers) = root.get_mut(servers_key).and_then(Value::as_object_mut) else {
        return Ok(Some(path));
    };

    servers.retain(|key, _| !is_tasedeck_topology_entry_key(key));
    write_mcp_json(&path, &root)?;
    Ok(Some(path))
}

fn strip_tasedeck_managed_json_entries(servers_map: &mut Map<String, Value>) {
    servers_map.retain(|key, entry| {
        !is_tasedeck_topology_entry_key(key) && !is_tasedeck_proxy_entry(entry)
    });
}

pub fn upsert_proxy_entries_in_agent_mcp_json(
    agent: &crate::db::AgentRecord,
    entries: &[McpProxyServerEntry],
) -> Result<PathBuf, String> {
    let path = agent_mcp_json_path(agent);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    if agent.kind == "codex-cli" {
        upsert_proxy_entries_in_codex_toml(&path, entries)?;
        return Ok(path);
    }

    let servers_key = mcp_servers_root_for_agent_kind(&agent.kind);
    let mut root = read_mcp_json_object(&path)?;
    let servers = root
        .entry(servers_key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));

    let Some(servers_map) = servers.as_object_mut() else {
        return Err(format!("{servers_key} in agent config must be an object"));
    };

    strip_tasedeck_managed_json_entries(servers_map);

    for entry in entries {
        let json_entry = if agent.kind == "opencode" {
            aggregator_config_to_opencode_entry(&entry.config)
        } else {
            aggregator_config_to_entry(&entry.config)
        };
        servers_map.insert(entry.entry_key.clone(), json_entry);
    }

    write_mcp_json(&path, &root)?;
    Ok(path)
}

pub fn remove_tasedeck_managed_from_agent_mcp_json(
    agent: &crate::db::AgentRecord,
) -> Result<Option<PathBuf>, String> {
    let path = agent_mcp_json_path(agent);
    if !path.is_file() {
        return Ok(None);
    }

    if agent.kind == "codex-cli" {
        remove_tasedeck_managed_from_codex_toml(&path)?;
        return Ok(Some(path));
    }

    let servers_key = mcp_servers_root_for_agent_kind(&agent.kind);
    let mut root = read_mcp_json_object(&path)?;
    let Some(servers) = root.get_mut(servers_key).and_then(Value::as_object_mut) else {
        return Ok(Some(path));
    };

    strip_tasedeck_managed_json_entries(servers);
    write_mcp_json(&path, &root)?;
    Ok(Some(path))
}

pub fn upsert_proxy_entries_in_project_mcp_json(
    project_root: &Path,
    kind: &str,
    entries: &[McpProxyServerEntry],
) -> Result<PathBuf, String> {
    let path = resolve_project_mcp_config_path(project_root, kind)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    if kind == "codex-cli" || path.extension().is_some_and(|ext| ext == "toml") {
        upsert_proxy_entries_in_codex_toml(&path, entries)?;
        return Ok(path);
    }

    let servers_key = mcp_servers_root_for_agent_kind(kind);
    let mut root = read_mcp_json_object(&path)?;
    let servers = root
        .entry(servers_key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));

    let Some(servers_map) = servers.as_object_mut() else {
        return Err(format!("{servers_key} in project config must be an object"));
    };

    strip_tasedeck_managed_json_entries(servers_map);

    for entry in entries {
        let mut json_entry = if kind == "opencode" {
            aggregator_config_to_opencode_entry(&entry.config)
        } else {
            aggregator_config_to_entry(&entry.config)
        };
        if let Some(obj) = json_entry.as_object_mut() {
            // Cursor spawns MCP with workspace root as cwd; set explicitly for reliable sidecar resolution.
            obj.insert(
                "cwd".to_string(),
                Value::String(project_root.display().to_string()),
            );
        }
        servers_map.insert(entry.entry_key.clone(), json_entry);
    }

    write_mcp_json(&path, &root)?;
    Ok(path)
}

pub fn remove_tasedeck_managed_from_project_mcp_json(
    project_root: &Path,
    kind: &str,
) -> Result<Option<PathBuf>, String> {
    let Some(path) = find_project_mcp_config(project_root, kind) else {
        return Ok(None);
    };
    if !path.is_file() {
        return Ok(None);
    }

    if kind == "codex-cli" || path.extension().is_some_and(|ext| ext == "toml") {
        remove_tasedeck_managed_from_codex_toml(&path)?;
        return Ok(Some(path));
    }

    let servers_key = mcp_servers_root_for_agent_kind(kind);
    let mut root = read_mcp_json_object(&path)?;
    let Some(servers) = root.get_mut(servers_key).and_then(Value::as_object_mut) else {
        return Ok(Some(path));
    };

    strip_tasedeck_managed_json_entries(servers);
    write_mcp_json(&path, &root)?;
    Ok(Some(path))
}

fn resolve_project_mcp_config_path(project_root: &Path, kind: &str) -> Result<PathBuf, String> {
    if let Some(path) = find_project_mcp_config(project_root, kind) {
        return Ok(path);
    }

    project_mcp_candidate_paths(kind, project_root)
        .into_iter()
        .next()
        .ok_or_else(|| format!("no MCP config path for agent kind \"{kind}\""))
}

pub fn sync_topology_project_mcp_json_for_graph(
    db: &Database,
    client_id: &str,
    name: &str,
    export_proxy: bool,
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
        let projects = db
            .list_projects_for_agent(agent_id)
            .map_err(|error| error.to_string())?;

        for project in projects {
            let paths = if export_proxy {
                crate::agents::project_proxy_export::sync_project_agent_proxy_mcp(
                    db,
                    None,
                    None,
                    project.id,
                    agent_id,
                )?
            } else {
                let project_root = PathBuf::from(project.folder_path.trim());
                let agent = db
                    .get_agent_record(agent_id)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| format!("agent {agent_id} not found"))?;
                remove_tasedeck_managed_from_project_mcp_json(&project_root, &agent.kind)?
                    .map(|entry| entry.display().to_string())
                    .into_iter()
                    .collect()
            };
            written.extend(paths);
        }
    }

    Ok(written)
}

fn active_server_ids_for_agent(
    links: &[crate::db::GraphServerLink],
    agent_id: i64,
) -> Vec<i64> {
    let mut ids = links
        .iter()
        .filter(|link| link.edge_enabled && link.active && link.agent_id == agent_id)
        .map(|link| link.mcp_server_id)
        .collect::<Vec<_>>();
    ids.sort_unstable();
    ids.dedup();
    ids
}

pub fn build_proxy_entries_for_agent(
    db: &Database,
    client_id: &str,
    name: &str,
    agent_id: i64,
    base_dir: &Path,
    overrides_root: Option<&Value>,
    caller: Option<&str>,
) -> Result<Vec<McpProxyServerEntry>, String> {
    let graph_state = db
        .get_graph_state_by_client_id(client_id, name)
        .map_err(|error| error.to_string())?;

    let override_map = overrides_root.and_then(Value::as_object);
    let mut entries = Vec::new();

    for server_id in active_server_ids_for_agent(&graph_state.links, agent_id) {
        let server = db
            .get_mcp_server(server_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("MCP server {server_id} not found"))?;

        let entry_key = server.name.trim().to_string();
        let patch = override_map
            .and_then(|map| map.get(&entry_key))
            .filter(|value| value.as_object().is_some_and(|obj| !obj.is_empty()));

        let runtime = mcp_server_for_runtime(&server).map_err(|error| error.to_string())?;
        let agent_kind = db
            .get_agent_record(agent_id)
            .ok()
            .flatten()
            .map(|agent| agent.kind)
            .unwrap_or_else(|| "cursor".to_string());
        entries.push(prepare_proxy_entry(
            db,
            None,
            0,
            base_dir,
            &agent_kind,
            &entry_key,
            &runtime,
            patch,
            caller,
        )?);
    }

    Ok(entries)
}

pub fn sync_topology_mcp_json_for_graph(
    db: &Database,
    client_id: &str,
    name: &str,
    export_proxy: bool,
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

        let path = if export_proxy {
            let base_dir = PathBuf::from(agent.config_dir_path.trim());
            let entries = build_proxy_entries_for_agent(
                db,
                client_id,
                name,
                agent_id,
                &base_dir,
                None,
                Some(&agent.name),
            )?;
            upsert_proxy_entries_in_agent_mcp_json(&agent, &entries)?
        } else {
            remove_tasedeck_managed_from_agent_mcp_json(&agent)?
                .unwrap_or_else(|| agent_mcp_json_path(&agent))
        };

        written.push(path.display().to_string());
    }

    Ok(written)
}

fn upsert_proxy_entries_in_codex_toml(
    path: &Path,
    entries: &[McpProxyServerEntry],
) -> Result<(), String> {
    let mut doc: TomlTable = if path.is_file() {
        let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
        toml::from_str(&raw).map_err(|error| format!("invalid config.toml: {error}"))?
    } else {
        TomlTable::new()
    };

    let mcp_servers = doc
        .entry("mcp_servers")
        .or_insert_with(|| TomlValue::Table(TomlTable::new()));
    let TomlValue::Table(mcp_servers) = mcp_servers else {
        return Err("mcp_servers in config.toml must be a table".to_string());
    };

    mcp_servers.retain(|key, value| {
        !is_tasedeck_topology_entry_key(key)
            && !toml_entry_is_tasedeck_proxy(value)
    });

    for entry in entries {
        mcp_servers.insert(
            entry.entry_key.clone(),
            proxy_entry_to_codex_toml_table(&entry.config),
        );
    }

    write_codex_toml(path, &doc)
}

fn remove_tasedeck_managed_from_codex_toml(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Ok(());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut doc: TomlTable =
        toml::from_str(&raw).map_err(|error| format!("invalid config.toml: {error}"))?;
    if let Some(TomlValue::Table(mcp_servers)) = doc.get_mut("mcp_servers") {
        mcp_servers.retain(|key, value| {
            !is_tasedeck_topology_entry_key(key)
                && !toml_entry_is_tasedeck_proxy(value)
        });
    }
    write_codex_toml(path, &doc)
}

fn toml_entry_is_tasedeck_proxy(value: &TomlValue) -> bool {
    let TomlValue::Table(table) = value else {
        return false;
    };
    if table
        .get(crate::services::TASEDECK_PROXY_ENTRY_MARKER)
        .is_some()
    {
        return true;
    }
    if let Some(TomlValue::Table(env)) = table.get("env") {
        if env.contains_key(crate::services::TASEDECK_PROXY_ENTRY_MARKER) {
            return true;
        }
    }
    table.get("args").and_then(TomlValue::as_array).is_some_and(|args| {
        args.iter().any(|item| {
            item.as_str()
                .is_some_and(|text| text.ends_with(crate::services::PROXY_SCRIPT_NAME))
        })
    })
}

fn proxy_entry_to_codex_toml_table(config: &TopologyAggregatorConfig) -> TomlValue {
    let mut server_table = TomlTable::new();
    server_table.insert(
        "command".to_string(),
        TomlValue::String(config.command.clone()),
    );
    if !config.args.is_empty() {
        server_table.insert(
            "args".to_string(),
            TomlValue::Array(
                config
                    .args
                    .iter()
                    .map(|arg| TomlValue::String(arg.clone()))
                    .collect(),
            ),
        );
    }
    server_table.insert("enabled".to_string(), TomlValue::Boolean(true));
    if !config.env.is_empty() {
        let mut env_table = TomlTable::new();
        for (key, value) in &config.env {
            env_table.insert(key.clone(), TomlValue::String(value.clone()));
        }
        server_table.insert("env".to_string(), TomlValue::Table(env_table));
    }
    TomlValue::Table(server_table)
}

pub fn default_mcp_json_template(kind: &str) -> String {
    let root_key = mcp_servers_root_for_kind(kind);
    format!("{{\n  \"{root_key}\": {{}}\n}}\n")
}

pub fn ensure_agent_mcp_json(agent_kind: &str, config_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(config_dir).map_err(|error| error.to_string())?;
    let file_name = provider_for(agent_kind)
        .map(|provider| provider.mcp_config_file_name().to_string())
        .unwrap_or_else(|_| "mcp.json".to_string());
    let is_toml = file_name.ends_with(".toml");
    let path = config_dir.join(&file_name);
    if !path.is_file() {
        if is_toml {
            fs::write(
                &path,
                "# MCP servers: use `codex mcp add` or [mcp_servers.*] tables\n",
            )
            .map_err(|error| error.to_string())?;
        } else {
            fs::write(&path, default_mcp_json_template(agent_kind))
                .map_err(|error| error.to_string())?;
        }
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

/// Read agent MCP config as normalized JSON for the UI (`mcpServers` root).
pub fn read_agent_mcp_config_as_json(path: &Path, kind: &str) -> Result<Option<Value>, String> {
    if !path.is_file() {
        return Ok(None);
    }

    if kind == "codex-cli" || path.extension().is_some_and(|ext| ext == "toml") {
        let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
        let doc: TomlTable = toml::from_str(&raw).map_err(|error| format!("invalid config.toml: {error}"))?;
        return Ok(Some(codex_toml_to_json(&doc)));
    }

    let root = read_mcp_json_object(path)?;
    Ok(Some(Value::Object(root)))
}

fn codex_toml_to_json(doc: &TomlTable) -> Value {
    let servers = doc
        .get("mcp_servers")
        .and_then(TomlValue::as_table)
        .map(toml_servers_to_json)
        .unwrap_or_else(|| Value::Object(Map::new()));
    json!({ "mcp_servers": servers })
}

fn toml_servers_to_json(table: &TomlTable) -> Value {
    let mut map = Map::new();
    for (name, value) in table {
        if let TomlValue::Table(server) = value {
            map.insert(name.clone(), toml_server_entry_to_json(server));
        }
    }
    Value::Object(map)
}

fn toml_server_entry_to_json(server: &TomlTable) -> Value {
    let mut entry = Map::new();
    if let Some(command) = server.get("command").and_then(TomlValue::as_str) {
        entry.insert("command".to_string(), Value::String(command.to_string()));
    }
    if let Some(args) = server.get("args").and_then(TomlValue::as_array) {
        let args: Vec<Value> = args
            .iter()
            .filter_map(|value| value.as_str().map(|text| Value::String(text.to_string())))
            .collect();
        if !args.is_empty() {
            entry.insert("args".to_string(), Value::Array(args));
        }
    }
    if let Some(url) = server.get("url").and_then(TomlValue::as_str) {
        entry.insert("url".to_string(), Value::String(url.to_string()));
    }
    if let Some(env) = server.get("env").and_then(TomlValue::as_table) {
        let env_map: Map<String, Value> = env
            .iter()
            .filter_map(|(key, value)| {
                value
                    .as_str()
                    .map(|text| (key.clone(), Value::String(text.to_string())))
            })
            .collect();
        if !env_map.is_empty() {
            entry.insert("env".to_string(), Value::Object(env_map));
        }
    }
    Value::Object(entry)
}

fn upsert_topology_in_codex_toml(
    path: &Path,
    entry_key: &str,
    aggregator: &TopologyAggregatorConfig,
) -> Result<(), String> {
    let mut doc: TomlTable = if path.is_file() {
        let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
        toml::from_str(&raw).map_err(|error| format!("invalid config.toml: {error}"))?
    } else {
        TomlTable::new()
    };

    let mcp_servers = doc
        .entry("mcp_servers")
        .or_insert_with(|| TomlValue::Table(TomlTable::new()));
    let TomlValue::Table(mcp_servers) = mcp_servers else {
        return Err("mcp_servers in config.toml must be a table".to_string());
    };

    mcp_servers.retain(|key, _| !is_tasedeck_topology_entry_key(key));

    let mut server_table = TomlTable::new();
    server_table.insert(
        "command".to_string(),
        TomlValue::String(aggregator.command.clone()),
    );
    if !aggregator.args.is_empty() {
        server_table.insert(
            "args".to_string(),
            TomlValue::Array(
                aggregator
                    .args
                    .iter()
                    .map(|arg| TomlValue::String(arg.clone()))
                    .collect(),
            ),
        );
    }
    server_table.insert("enabled".to_string(), TomlValue::Boolean(true));
    if !aggregator.env.is_empty() {
        let mut env_table = TomlTable::new();
        for (key, value) in &aggregator.env {
            env_table.insert(key.clone(), TomlValue::String(value.clone()));
        }
        server_table.insert("env".to_string(), TomlValue::Table(env_table));
    }

    mcp_servers.insert(entry_key.to_string(), TomlValue::Table(server_table));
    write_codex_toml(path, &doc)
}

fn remove_topology_from_codex_toml(path: &Path) -> Result<(), String> {
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut doc: TomlTable =
        toml::from_str(&raw).map_err(|error| format!("invalid config.toml: {error}"))?;
    if let Some(TomlValue::Table(mcp_servers)) = doc.get_mut("mcp_servers") {
        mcp_servers.retain(|key, _| !is_tasedeck_topology_entry_key(key));
    }
    write_codex_toml(path, &doc)
}

fn write_codex_toml(path: &Path, doc: &TomlTable) -> Result<(), String> {
    let payload = toml::to_string_pretty(doc).map_err(|error| error.to_string())?;
    fs::write(path, format!("{payload}\n")).map_err(|error| error.to_string())
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

pub fn write_mcp_json_value(path: &Path, root: &Value) -> Result<(), String> {
    let obj = root
        .as_object()
        .ok_or_else(|| "mcp config root must be an object".to_string())?;
    write_mcp_json(path, obj)
}

/// Restores project `mcp.json` for an agent kind from a native snapshot (or empty servers).
pub fn restore_project_mcp_json_to_snapshot(
    project_root: &Path,
    agent_kind: &str,
    snapshot_json: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut written =
        crate::agents::project_proxy_export::cleanup_tasedeck_project_agent_artifacts(
            project_root,
            agent_kind,
        )?;

    let path = resolve_project_mcp_config_path(project_root, agent_kind)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let value: Value = match snapshot_json.map(str::trim).filter(|entry| !entry.is_empty()) {
        Some(json) => serde_json::from_str(json).unwrap_or_else(|_| json!({ "mcpServers": {} })),
        None => json!({ "mcpServers": {} }),
    };
    write_mcp_json_value(&path, &value)?;
    written.push(path.display().to_string());
    Ok(written)
}
