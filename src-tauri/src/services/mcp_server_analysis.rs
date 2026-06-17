use crate::db::McpServer;
use crate::error::{AppError, AppResult};
use crate::services::mcp_config_template::{
    canonical_header_id, normalize_header_row_name, registry_braces_to_env_template,
};
use crate::services::mcp_registry_install::{
    collect_package_inputs, collect_remote_inputs, RegistryPackage, RegistryRemote, RegistryServer,
};
use crate::services::mcp_run_command::compile_run_command_template_from_config_values;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

const RUN_COMMANDS_CONFIG_KEY: &str = "__runCommands";
const ENV_VARIABLES_CONFIG_KEY: &str = "__envVariables";
const HEADERS_CONFIG_KEY: &str = "__headers";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerAnalysis {
    pub run_commands: RunCommandsState,
    pub config_inputs: Vec<AnalysisConfigInput>,
    pub env_variables: Vec<AnalysisEnvRow>,
    pub header_variables: Vec<AnalysisHeaderRow>,
    pub compiled_command_template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCommandsState {
    pub active_id: Option<String>,
    pub commands: Vec<RunCommandProfile>,
    pub shared_args: Vec<RunCommandArg>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCommandProfile {
    pub id: String,
    pub transport: String,
    #[serde(default)]
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default)]
    pub args: Vec<RunCommandArg>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCommandArg {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisConfigInput {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub is_required: bool,
    pub is_secret: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisEnvRow {
    pub id: String,
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisHeaderRow {
    pub id: String,
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerApi {
    #[serde(flatten)]
    pub server: McpServer,
    pub analysis: McpServerAnalysis,
}

pub fn analyze_mcp_server(server: &McpServer) -> AppResult<McpServerAnalysis> {
    let values = parse_values_map(&server.config_values)?;
    let stored_inputs = parse_config_inputs(&server.config_inputs)?;
    let config_root = parse_json_value(&server.json_config);

    let inferred_inputs = infer_config_inputs(&config_root, &stored_inputs);
    let config_inputs = dedupe_inputs(inferred_inputs);

    let run_commands = infer_run_commands(server, &values, &config_root)?;
    let header_variables = build_header_rows(&config_inputs, &values, &config_root);
    let env_variables =
        build_env_rows(&config_inputs, &values, &config_root, &header_variables);

    let mut values_with_run = values.clone();
    values_with_run.insert(
        RUN_COMMANDS_CONFIG_KEY.to_string(),
        serde_json::to_string(&run_commands).map_err(|error| {
            AppError::Message(format!("failed to encode run commands: {error}"))
        })?,
    );
    let compiled_command_template =
        compile_run_command_template_from_config_values(&serde_json::to_string(&values_with_run).map_err(
            |error| AppError::Message(format!("failed to encode config values: {error}")),
        )?)
        .unwrap_or_default();

    Ok(McpServerAnalysis {
        run_commands,
        config_inputs,
        env_variables,
        header_variables,
        compiled_command_template,
    })
}

fn parse_values_map(raw: &str) -> AppResult<HashMap<String, String>> {
    if raw.trim().is_empty() {
        return Ok(HashMap::new());
    }
    serde_json::from_str(raw)
        .map_err(|error| AppError::Message(format!("invalid config_values JSON: {error}")))
}

fn parse_config_inputs(raw: &str) -> AppResult<Vec<AnalysisConfigInput>> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(raw)
        .map_err(|error| AppError::Message(format!("invalid config_inputs JSON: {error}")))
}

fn parse_json_value(raw: &str) -> Value {
    if raw.trim().is_empty() {
        return json!({});
    }
    serde_json::from_str(raw).unwrap_or(json!({}))
}

fn infer_config_inputs(
    config_root: &Value,
    stored_inputs: &[AnalysisConfigInput],
) -> Vec<AnalysisConfigInput> {
    let mut inputs = stored_inputs.to_vec();
    inputs.extend(infer_inputs_from_json(config_root));
    dedupe_inputs(inputs)
}

fn infer_inputs_from_json(config_root: &Value) -> Vec<AnalysisConfigInput> {
    let mut inputs = Vec::new();

    if let Ok(registry_server) = serde_json::from_value::<RegistryServer>(config_root.clone()) {
        inputs.extend(inputs_from_registry_server(&registry_server));
    }

    if let Some(server) = config_root.get("server") {
        if let Ok(registry_server) = serde_json::from_value::<RegistryServer>(server.clone()) {
            inputs.extend(inputs_from_registry_server(&registry_server));
        }
    }

    if let Some(packages) = config_root.get("packages").and_then(Value::as_array) {
        for pkg in packages {
            if let Ok(package) = serde_json::from_value::<RegistryPackage>(pkg.clone()) {
                inputs.extend(
                    collect_package_inputs(&package)
                        .into_iter()
                        .map(analysis_input_from_registry),
                );
            }
        }
    }

    if let Some(remotes) = config_root.get("remotes").and_then(Value::as_array) {
        for (index, remote) in remotes.iter().enumerate() {
            if let Ok(remote_entry) = serde_json::from_value::<RegistryRemote>(remote.clone()) {
                inputs.extend(
                    collect_remote_inputs(&remote_entry, index)
                        .into_iter()
                        .map(analysis_input_from_registry),
                );
            }
        }
    }

    if let Some(mcp_servers) = config_root
        .get("mcpServers")
        .and_then(Value::as_object)
    {
        for entry in mcp_servers.values() {
            inputs.extend(inputs_from_mcp_server_entry(entry));
        }
    }

    inputs
}

fn inputs_from_registry_server(server: &RegistryServer) -> Vec<AnalysisConfigInput> {
    let mut inputs = Vec::new();
    for pkg in server.packages.iter().flatten() {
        inputs.extend(
            collect_package_inputs(pkg)
                .into_iter()
                .map(analysis_input_from_registry),
        );
    }
    for (index, remote) in server.remotes.iter().flatten().enumerate() {
        inputs.extend(
            collect_remote_inputs(remote, index)
                .into_iter()
                .map(analysis_input_from_registry),
        );
    }
    inputs
}

fn inputs_from_mcp_server_entry(entry: &Value) -> Vec<AnalysisConfigInput> {
    let mut inputs = Vec::new();
    if let Some(env) = entry.get("env").and_then(Value::as_object) {
        for name in env.keys() {
            let trimmed = name.trim();
            if !trimmed.is_empty() {
                inputs.push(env_input_from_name(trimmed));
            }
        }
    }

    if let Some(headers) = entry.get("headers").and_then(Value::as_object) {
        for (name, value) in headers {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                continue;
            }
            let template = value.as_str().unwrap_or_default();
            inputs.push(header_input_from_name(trimmed, template));
        }
    }

    for key in collect_placeholder_keys_from_value(entry) {
        inputs.push(env_input_from_name(&key));
    }
    inputs
}

fn header_input_from_name(name: &str, template: &str) -> AnalysisConfigInput {
    let normalized = registry_braces_to_env_template(template);
    AnalysisConfigInput {
        id: canonical_header_id(name),
        name: name.to_string(),
        description: None,
        is_required: false,
        is_secret: regex_is_secret(name) || regex_is_secret(&normalized),
        default_value: if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        },
        placeholder: None,
        source: "header".to_string(),
    }
}

fn analysis_input_from_registry(
    input: crate::services::mcp_registry_install::ConfigInput,
) -> AnalysisConfigInput {
    AnalysisConfigInput {
        id: input.id,
        name: input.name,
        description: input.description,
        is_required: input.is_required,
        is_secret: input.is_secret,
        default_value: input.default_value,
        placeholder: input.placeholder,
        source: input.source,
    }
}

fn env_input_from_name(name: &str) -> AnalysisConfigInput {
    AnalysisConfigInput {
        id: format!("env:{name}"),
        name: name.to_string(),
        description: None,
        is_required: true,
        is_secret: regex_is_secret(name),
        default_value: None,
        placeholder: None,
        source: "environment".to_string(),
    }
}

fn regex_is_secret(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    ["key", "token", "secret", "password", "credential"]
        .iter()
        .any(|part| lower.contains(part))
}

fn dedupe_inputs(inputs: Vec<AnalysisConfigInput>) -> Vec<AnalysisConfigInput> {
    let mut by_key = HashMap::new();
    for mut input in inputs {
        if input.source == "header" {
            input.id = canonical_header_id(&input.name);
            if let Some(default_value) = input.default_value.as_ref() {
                input.default_value =
                    Some(registry_braces_to_env_template(default_value));
            }
            by_key.insert(canonical_header_id(&input.name), input);
            continue;
        }
        by_key.insert(input.id.clone(), input);
    }
    by_key.into_values().collect()
}

fn infer_run_commands(
    server: &McpServer,
    values: &HashMap<String, String>,
    config_root: &Value,
) -> AppResult<RunCommandsState> {
    let stored = parse_stored_run_commands(values);
    let mut commands = stored
        .as_ref()
        .map(|state| state.commands.clone())
        .unwrap_or_default();
    let shared_args = stored
        .as_ref()
        .map(|state| state.shared_args.clone())
        .unwrap_or_default();

    let inferred = infer_profiles_from_json(config_root)
        .into_iter()
        .chain(infer_profiles_from_registry_shape(config_root))
        .collect::<Vec<_>>();

    if commands.is_empty() {
        commands = inferred;
        if commands.is_empty() {
            if let Some(profile) = infer_profile_from_shell(&server.run_command) {
                commands.push(profile);
            }
        }
    } else {
        for profile in inferred {
            if !commands
                .iter()
                .any(|existing| run_profiles_equivalent(existing, &profile))
            {
                commands.push(profile);
            }
        }
    }

    if commands.is_empty() {
        return Ok(RunCommandsState {
            active_id: None,
            commands: Vec::new(),
            shared_args,
        });
    }

    let active_id = stored
        .and_then(|state| state.active_id)
        .filter(|id| commands.iter().any(|profile| profile.id == *id))
        .or_else(|| commands.first().map(|profile| profile.id.clone()));

    Ok(RunCommandsState {
        active_id,
        commands,
        shared_args,
    })
}

fn run_profiles_equivalent(left: &RunCommandProfile, right: &RunCommandProfile) -> bool {
    if left.transport != right.transport {
        return false;
    }
    match (left.url.as_deref(), right.url.as_deref()) {
        (Some(left_url), Some(right_url)) => left_url.trim() == right_url.trim(),
        (None, None) => left.command.trim() == right.command.trim(),
        _ => false,
    }
}

fn parse_stored_run_commands(values: &HashMap<String, String>) -> Option<RunCommandsState> {
    let raw = values.get(RUN_COMMANDS_CONFIG_KEY)?;
    serde_json::from_str(raw).ok()
}

fn infer_profiles_from_json(config_root: &Value) -> Vec<RunCommandProfile> {
    let Some(mcp_servers) = config_root
        .get("mcpServers")
        .and_then(Value::as_object)
    else {
        return Vec::new();
    };

    let mut profiles = Vec::new();
    for entry in mcp_servers.values() {
        if let Some(profile) = profile_from_mcp_server_entry(entry) {
            profiles.push(profile);
        }
    }
    profiles
}

fn infer_profiles_from_registry_shape(config_root: &Value) -> Vec<RunCommandProfile> {
    let mut profiles = Vec::new();

    let registry_servers = [
        config_root.clone(),
        config_root.get("server").cloned().unwrap_or(Value::Null),
    ];

    for candidate in registry_servers {
        let Ok(server) = serde_json::from_value::<RegistryServer>(candidate) else {
            continue;
        };

        for pkg in server.packages.iter().flatten() {
            if let Some(transport) = &pkg.transport {
                if let Some(url) = transport.url.as_deref().filter(|value| !value.is_empty()) {
                    let transport_type =
                        normalize_transport_type(transport.transport_type.as_deref());
                    if transport_type != "stdio" {
                        profiles.push(RunCommandProfile {
                            id: create_run_id("run"),
                            transport: transport_type,
                            command: String::new(),
                            url: Some(url.to_string()),
                            args: Vec::new(),
                        });
                        continue;
                    }
                }
            }

            let command = pkg
                .runtime_hint
                .clone()
                .or_else(|| default_runtime_hint(&pkg.registry_type).map(str::to_string))
                .unwrap_or_else(|| pkg.identifier.clone());
            let mut parts = vec![command];
            parts.extend(
                pkg.runtime_arguments
                    .iter()
                    .flatten()
                    .filter_map(|arg| arg.value.clone().or_else(|| arg.name.clone())),
            );
            parts.extend(
                pkg.package_arguments
                    .iter()
                    .flatten()
                    .filter_map(|arg| arg.value.clone().or_else(|| arg.name.clone())),
            );
            profiles.push(RunCommandProfile {
                id: create_run_id("run"),
                transport: "stdio".to_string(),
                command: parts.join(" "),
                url: None,
                args: Vec::new(),
            });
        }

        for (index, remote) in server.remotes.iter().flatten().enumerate() {
            profiles.push(RunCommandProfile {
                id: create_run_id("run"),
                transport: normalize_transport_type(remote.remote_type.as_deref()),
                command: String::new(),
                url: Some(remote.url.clone()),
                args: Vec::new(),
            });
            let _ = index;
        }
    }

    profiles
}

fn profile_from_mcp_server_entry(entry: &Value) -> Option<RunCommandProfile> {
    if let Some(url) = entry.get("url").and_then(Value::as_str).map(str::trim) {
        if !url.is_empty() {
            return Some(RunCommandProfile {
                id: create_run_id("run"),
                transport: normalize_transport_type(entry.get("type").and_then(Value::as_str)),
                command: String::new(),
                url: Some(url.to_string()),
                args: Vec::new(),
            });
        }
    }

    let command = entry.get("command").and_then(Value::as_str)?.trim();
    if command.is_empty() {
        return None;
    }

    let mut parts = vec![command.to_string()];
    if let Some(args) = entry.get("args").and_then(Value::as_array) {
        for arg in args {
            if let Some(text) = arg.as_str().map(str::trim) {
                if !text.is_empty() {
                    parts.push(text.to_string());
                }
            }
        }
    }

    Some(RunCommandProfile {
        id: create_run_id("run"),
        transport: "stdio".to_string(),
        command: parts.join(" "),
        url: None,
        args: Vec::new(),
    })
}

fn infer_profile_from_shell(shell: &str) -> Option<RunCommandProfile> {
    let trimmed = shell.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(url) = trimmed.strip_prefix("http ") {
        return Some(RunCommandProfile {
            id: create_run_id("run"),
            transport: "streamable-http".to_string(),
            command: String::new(),
            url: Some(url.trim().to_string()),
            args: Vec::new(),
        });
    }
    if let Some(url) = trimmed.strip_prefix("sse ") {
        return Some(RunCommandProfile {
            id: create_run_id("run"),
            transport: "sse".to_string(),
            command: String::new(),
            url: Some(url.trim().to_string()),
            args: Vec::new(),
        });
    }
    Some(RunCommandProfile {
        id: create_run_id("run"),
        transport: "stdio".to_string(),
        command: trimmed.to_string(),
        url: None,
        args: Vec::new(),
    })
}

fn build_env_rows(
    config_inputs: &[AnalysisConfigInput],
    values: &HashMap<String, String>,
    config_root: &Value,
    header_rows: &[AnalysisHeaderRow],
) -> Vec<AnalysisEnvRow> {
    let mut rows = parse_stored_env_rows(values);
    let mut seen: HashSet<String> = rows.iter().map(|row| row.name.clone()).collect();

    let mut names = HashSet::new();
    // Expand env placeholders from header values first.
    for header in header_rows {
        collect_placeholders_from_str(&header.value, &mut names);
        collect_placeholders_from_str(&header.name, &mut names);
    }
    if let Some(headers) = first_mcp_server_entry(config_root)
        .and_then(|entry| entry.get("headers"))
    {
        for key in collect_placeholder_keys_from_value(headers) {
            names.insert(key);
        }
    }
    for input in config_inputs {
        if input.source == "environment" {
            names.insert(input.name.clone());
        }
    }
    for key in collect_placeholder_keys_from_value(config_root) {
        names.insert(key);
    }

    for name in names {
        let trimmed = name.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        let value = values
            .get(&format!("env:{trimmed}"))
            .cloned()
            .unwrap_or_default();
        rows.push(AnalysisEnvRow {
            id: format!("env:{trimmed}"),
            name: trimmed.to_string(),
            value,
        });
    }

    rows
}

fn first_mcp_server_entry<'a>(config_root: &'a Value) -> Option<&'a Value> {
    config_root
        .get("mcpServers")
        .and_then(Value::as_object)
        .and_then(|servers| servers.values().next())
}

fn build_header_rows(
    config_inputs: &[AnalysisConfigInput],
    values: &HashMap<String, String>,
    config_root: &Value,
) -> Vec<AnalysisHeaderRow> {
    let mut rows = parse_stored_header_rows(values);
    let mut seen: HashSet<String> = rows.iter().map(|row| row.name.clone()).collect();

    if let Some(headers) = first_mcp_server_entry(config_root)
        .and_then(|entry| entry.get("headers"))
        .and_then(Value::as_object)
    {
        for (name, value) in headers {
            let trimmed = name.trim();
            if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
                continue;
            }
            let template =
                registry_braces_to_env_template(value.as_str().unwrap_or_default());
            rows.push(AnalysisHeaderRow {
                id: canonical_header_id(trimmed),
                name: trimmed.to_string(),
                value: template,
            });
        }
    }

    for input in config_inputs {
        if input.source != "header" {
            continue;
        }
        let trimmed = input.name.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        let value = input
            .default_value
            .as_ref()
            .map(|text| registry_braces_to_env_template(text))
            .filter(|text| !text.is_empty())
            .unwrap_or_default();
        rows.push(AnalysisHeaderRow {
            id: canonical_header_id(trimmed),
            name: trimmed.to_string(),
            value,
        });
    }

    rows
}

fn parse_stored_header_rows(values: &HashMap<String, String>) -> Vec<AnalysisHeaderRow> {
    let Some(raw) = values.get(HEADERS_CONFIG_KEY) else {
        return Vec::new();
    };
    let Ok(items) = serde_json::from_str::<Vec<Value>>(raw) else {
        return Vec::new();
    };

    items
        .into_iter()
        .filter_map(|item| {
            let raw_name = item.get("name")?.as_str()?.trim();
            if raw_name.is_empty() {
                return None;
            }
            let name = normalize_header_row_name(raw_name);
            if name.is_empty() {
                return None;
            }
            let raw_value = item
                .get("value")
                .and_then(Value::as_str)
                .unwrap_or("");
            Some(AnalysisHeaderRow {
                id: canonical_header_id(&name),
                name,
                value: registry_braces_to_env_template(raw_value),
            })
        })
        .collect()
}

fn parse_stored_env_rows(values: &HashMap<String, String>) -> Vec<AnalysisEnvRow> {
    let Some(raw) = values.get(ENV_VARIABLES_CONFIG_KEY) else {
        return Vec::new();
    };
    let Ok(items) = serde_json::from_str::<Vec<Value>>(raw) else {
        return Vec::new();
    };

    items
        .into_iter()
        .filter_map(|item| {
            let name = item.get("name")?.as_str()?.trim();
            if name.is_empty() {
                return None;
            }
            Some(AnalysisEnvRow {
                id: item
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("env:{name}")),
                name: name.to_string(),
                value: item
                    .get("value")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
            })
        })
        .collect()
}

fn collect_placeholder_keys_from_value(value: &Value) -> HashSet<String> {
    let mut keys = HashSet::new();
    collect_placeholders_from_str(&value.to_string(), &mut keys);
    if let Some(obj) = value.as_object() {
        for (key, nested) in obj {
            collect_placeholders_from_str(key, &mut keys);
            if let Some(text) = nested.as_str() {
                collect_placeholders_from_str(text, &mut keys);
            }
        }
    }
    if let Some(array) = value.as_array() {
        for item in array {
            keys.extend(collect_placeholder_keys_from_value(item));
        }
    }
    keys
}

fn collect_placeholders_from_str(text: &str, keys: &mut HashSet<String>) {
    let mut rest = text;
    while let Some(start) = rest.find("${") {
        let after = &rest[start + 2..];
        if let Some(end) = after.find('}') {
            let name = after[..end].trim();
            if !name.is_empty() {
                keys.insert(name.to_string());
            }
            rest = &after[end + 1..];
        } else {
            break;
        }
    }

    let mut rest = text;
    while let Some(start) = rest.find('{') {
        if rest.as_bytes().get(start + 1) == Some(&b'$') {
            rest = &rest[start + 1..];
            continue;
        }
        let after = &rest[start + 1..];
        if let Some(end) = after.find('}') {
            let name = after[..end].trim();
            if !name.is_empty()
                && name
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
            {
                keys.insert(name.to_string());
            }
            rest = &after[end + 1..];
        } else {
            break;
        }
    }
}

fn normalize_transport_type(raw: Option<&str>) -> String {
    match raw.unwrap_or("streamable-http").trim().to_ascii_lowercase().replace('_', "-").as_str() {
        "sse" => "sse".to_string(),
        "http" | "streamable-http" | "streamable" => "streamable-http".to_string(),
        "stdio" => "stdio".to_string(),
        other => other.to_string(),
    }
}

fn default_runtime_hint(registry_type: &str) -> Option<&'static str> {
    match registry_type {
        "npm" => Some("npx"),
        "pypi" => Some("uvx"),
        "nuget" => Some("dnx"),
        "oci" => Some("docker"),
        _ => None,
    }
}

fn create_run_id(prefix: &str) -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{millis}-{seq}")
}
