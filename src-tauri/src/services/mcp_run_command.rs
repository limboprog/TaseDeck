use crate::db::McpServer;
use crate::error::{AppError, AppResult};
use crate::services::security::reveal_config_values_for_runtime;
use serde::Deserialize;
use std::collections::HashMap;

const RUN_COMMANDS_CONFIG_KEY: &str = "__runCommands";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunCommandsState {
    #[serde(default)]
    active_id: Option<String>,
    #[serde(default)]
    commands: Vec<RunCommandProfile>,
    #[serde(default)]
    shared_args: Vec<RunCommandArg>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunCommandProfile {
    id: String,
    transport: String,
    #[serde(default)]
    command: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    args: Vec<RunCommandArg>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunCommandArg {
    #[serde(default)]
    name: String,
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    value: String,
}

fn parse_run_commands_for_compile(
    config_values_json: &str,
) -> AppResult<Option<(RunCommandProfile, Vec<RunCommandArg>)>> {
    let values: HashMap<String, String> = if config_values_json.trim().is_empty() {
        HashMap::new()
    } else {
        serde_json::from_str(config_values_json).map_err(|error| {
            AppError::Message(format!("invalid config_values JSON: {error}"))
        })?
    };

    let raw = values
        .get(RUN_COMMANDS_CONFIG_KEY)
        .map(String::as_str)
        .unwrap_or("")
        .trim();
    if raw.is_empty() {
        return Ok(None);
    }

    let state: RunCommandsState = serde_json::from_str(raw)
        .map_err(|error| AppError::Message(format!("invalid run commands state: {error}")))?;

    let profile = state
        .active_id
        .as_ref()
        .and_then(|active_id| state.commands.iter().find(|entry| &entry.id == active_id))
        .or_else(|| state.commands.first())
        .cloned();

    let Some(profile) = profile else {
        return Ok(None);
    };

    let shared_args = resolve_shared_args(&state);
    Ok(Some((profile, shared_args)))
}

fn resolve_shared_args(state: &RunCommandsState) -> Vec<RunCommandArg> {
    if !state.shared_args.is_empty() {
        return state.shared_args.clone();
    }
    state
        .commands
        .iter()
        .find(|entry| entry.transport == "stdio")
        .map(|entry| entry.args.clone())
        .filter(|args| !args.is_empty())
        .unwrap_or_default()
}

/// Stored in DB: active command + enabled args, `${var}` kept for later substitution.
pub fn compile_run_command_template_from_config_values(config_values_json: &str) -> AppResult<String> {
    let Some((profile, shared_args)) = parse_run_commands_for_compile(config_values_json)? else {
        return Ok(String::new());
    };
    Ok(compile_profile_template(&profile, &shared_args))
}

/// Runtime shell line with env values substituted into `${name}` placeholders.
pub fn compile_run_command_from_config_values(config_values_json: &str) -> AppResult<String> {
    let values: HashMap<String, String> = if config_values_json.trim().is_empty() {
        HashMap::new()
    } else {
        serde_json::from_str(config_values_json).map_err(|error| {
            AppError::Message(format!("invalid config_values JSON: {error}"))
        })?
    };

    let Some((profile, shared_args)) = parse_run_commands_for_compile(config_values_json)? else {
        return Ok(String::new());
    };
    Ok(compile_profile_resolved(&profile, &shared_args, &values))
}

fn compile_profile_template(profile: &RunCommandProfile, shared_args: &[RunCommandArg]) -> String {
    if profile.transport == "streamable-http" || profile.transport == "sse" {
        let url = profile.url.as_deref().unwrap_or("").trim();
        if url.is_empty() {
            return String::new();
        }
        let mut parts = vec![if profile.transport == "sse" {
            format!("sse {url}")
        } else {
            format!("http {url}")
        }];
        push_enabled_args(&mut parts, shared_args, |arg| map_arg_template(arg));
        return parts.join(" ");
    }

    let base = profile.command.trim();
    if base.is_empty() {
        return String::new();
    }

    let mut parts = vec![base.to_string()];
    push_enabled_args(&mut parts, shared_args, |arg| map_arg_template(arg));
    parts.join(" ")
}

fn compile_profile_resolved(
    profile: &RunCommandProfile,
    shared_args: &[RunCommandArg],
    env: &HashMap<String, String>,
) -> String {
    if profile.transport == "streamable-http" || profile.transport == "sse" {
        return compile_remote_shell(profile, shared_args, env);
    }

    let template = compile_profile_template(profile, shared_args);
    let exports = build_export_prefix(env);
    if exports.is_empty() {
        template
    } else {
        format!("{exports} {template}")
    }
}

fn compile_remote_shell(
    profile: &RunCommandProfile,
    shared_args: &[RunCommandArg],
    env: &HashMap<String, String>,
) -> String {
    let url = resolve_env_template(profile.url.as_deref().unwrap_or(""), env)
        .trim()
        .to_string();
    if url.is_empty() {
        return String::new();
    }
    let mut parts = vec![if profile.transport == "sse" {
        format!("sse {url}")
    } else {
        format!("http {url}")
    }];
    push_enabled_args(&mut parts, shared_args, |arg| map_arg_template(arg));
    parts.join(" ")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum McpActiveTransport {
    Stdio,
    Remote {
        transport_type: String,
        url: String,
    },
}

pub fn resolve_active_transport(config_values_json: &str) -> AppResult<Option<McpActiveTransport>> {
    let Some((profile, _shared_args)) = parse_run_commands_for_compile(config_values_json)? else {
        return Ok(None);
    };

    if profile.transport == "streamable-http" || profile.transport == "sse" {
        let values: HashMap<String, String> = if config_values_json.trim().is_empty() {
            HashMap::new()
        } else {
            serde_json::from_str(config_values_json).map_err(|error| {
                AppError::Message(format!("invalid config_values JSON: {error}"))
            })?
        };
        let url = resolve_env_template(profile.url.as_deref().unwrap_or(""), &values)
            .trim()
            .to_string();
        return Ok(Some(McpActiveTransport::Remote {
            transport_type: profile.transport,
            url,
        }));
    }

    Ok(Some(McpActiveTransport::Stdio))
}

pub fn is_active_profile_remote(config_values_json: &str) -> bool {
    matches!(
        resolve_active_transport(config_values_json),
        Ok(Some(McpActiveTransport::Remote { .. }))
    )
}

fn map_arg_template(arg: &RunCommandArg) -> Option<String> {
    let name = arg.name.trim();
    if name.is_empty() {
        return None;
    }
    let value = arg.value.trim();
    if value.is_empty() {
        Some(name.to_string())
    } else {
        Some(format!("{name} {value}"))
    }
}

fn push_enabled_args<F>(parts: &mut Vec<String>, args: &[RunCommandArg], map_arg: F)
where
    F: Fn(&RunCommandArg) -> Option<String>,
{
    for arg in args {
        if !arg.enabled {
            continue;
        }
        if let Some(piece) = map_arg(arg) {
            parts.push(piece);
        }
    }
}

fn shell_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn build_export_prefix(env: &HashMap<String, String>) -> String {
    let mut parts = Vec::new();
    for (name, value) in collect_env_bindings(env) {
        if value.trim().is_empty() {
            continue;
        }
        parts.push(format!("export {}=\"{}\"", name, shell_escape(&value)));
    }
    parts.join(" ")
}

fn resolve_env_template(template: &str, env: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (name, value) in collect_env_bindings(env) {
        let needle = format!("${{{name}}}");
        if result.contains(&needle) {
            result = result.replace(&needle, &value);
        }
    }
    result
}

fn collect_env_bindings(env: &HashMap<String, String>) -> Vec<(String, String)> {
    let mut bindings = Vec::new();
    let mut seen = std::collections::HashSet::new();

    if let Some(raw) = env.get("__envVariables") {
        if let Ok(rows) = serde_json::from_str::<Vec<serde_json::Value>>(raw) {
            for row in rows {
                let Some(name) = row.get("name").and_then(|v| v.as_str()) else {
                    continue;
                };
                let name = name.trim();
                if name.is_empty() || !seen.insert(name.to_string()) {
                    continue;
                }
                let value = row
                    .get("value")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                bindings.push((name.to_string(), value));
            }
        }
    }

    for (key, value) in env {
        if key.starts_with("__") {
            continue;
        }
        let name = key.strip_prefix("env:").unwrap_or(key.as_str()).trim();
        if name.is_empty() || !seen.insert(name.to_string()) {
            continue;
        }
        bindings.push((name.to_string(), value.clone()));
    }

    bindings
}

pub fn apply_compiled_run_command(server: &mut McpServer) -> AppResult<()> {
    if let Ok(compiled) = compile_run_command_template_from_config_values(&server.config_values) {
        if !compiled.trim().is_empty() {
            server.run_command = compiled;
        }
    }
    Ok(())
}

pub fn mcp_server_for_runtime(server: &McpServer) -> AppResult<McpServer> {
    let mut runtime_server = server.clone();
    runtime_server.config_values = reveal_config_values_for_runtime(&server.config_values)?;
    if let Ok(compiled) = compile_run_command_from_config_values(&runtime_server.config_values) {
        if !compiled.trim().is_empty() {
            runtime_server.run_command = compiled;
        }
    }
    Ok(runtime_server)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_stdio_command_and_args() {
        let run_commands = serde_json::json!({
            "activeId": "run-1",
            "sharedArgs": [
                { "name": "/tmp/server.mjs", "enabled": true, "value": "" }
            ],
            "commands": [{
                "id": "run-1",
                "transport": "stdio",
                "command": "node",
                "args": []
            }]
        });
        let config_values = serde_json::json!({
            "__runCommands": run_commands.to_string()
        });
        let compiled = compile_run_command_template_from_config_values(&config_values.to_string())
            .expect("compile");
        assert_eq!(compiled, "node /tmp/server.mjs");
    }

    #[test]
    fn appends_shared_args_to_http_transport() {
        let run_commands = serde_json::json!({
            "activeId": "run-http",
            "sharedArgs": [
                { "name": "-y", "enabled": true, "value": "" }
            ],
            "commands": [
                {
                    "id": "run-http",
                    "transport": "streamable-http",
                    "url": "https://example.com/mcp",
                    "args": []
                }
            ]
        });
        let config_values = serde_json::json!({
            "__runCommands": run_commands.to_string()
        });
        let compiled = compile_run_command_template_from_config_values(&config_values.to_string())
            .expect("compile");
        assert_eq!(compiled, "http https://example.com/mcp -y");
    }

    #[test]
    fn resolves_env_from_variables_blob() {
        let run_commands = serde_json::json!({
            "activeId": "run-1",
            "sharedArgs": [],
            "commands": [{
                "id": "run-1",
                "transport": "stdio",
                "command": "node ${script_path}",
                "args": []
            }]
        });
        let env_rows = serde_json::json!([{
            "id": "env-1",
            "name": "script_path",
            "value": "/tmp/server.mjs"
        }]);
        let config_values = serde_json::json!({
            "__runCommands": run_commands.to_string(),
            "__envVariables": env_rows.to_string()
        });
        let resolved = compile_run_command_from_config_values(&config_values.to_string())
            .expect("resolved");
        assert_eq!(
            resolved,
            "export script_path=\"/tmp/server.mjs\" node ${script_path}"
        );
    }

    #[test]
    fn resolves_placeholders_in_argument_name() {
        let run_commands = serde_json::json!({
            "activeId": "run-1",
            "sharedArgs": [
                { "name": "--token ${api_key}", "enabled": true, "value": "" }
            ],
            "commands": [{
                "id": "run-1",
                "transport": "stdio",
                "command": "node",
                "args": []
            }]
        });
        let config_values = serde_json::json!({
            "__runCommands": run_commands.to_string(),
            "env:api_key": "secret"
        });
        let resolved = compile_run_command_from_config_values(&config_values.to_string())
            .expect("resolved");
        assert_eq!(resolved, "export api_key=\"secret\" node --token ${api_key}");
    }

    #[test]
    fn template_keeps_env_placeholders() {
        let run_commands = serde_json::json!({
            "activeId": "run-1",
            "sharedArgs": [
                { "name": "-y", "enabled": true, "value": "" }
            ],
            "commands": [{
                "id": "run-1",
                "transport": "stdio",
                "command": "node ${api_key}",
                "args": []
            }]
        });
        let config_values = serde_json::json!({
            "__runCommands": run_commands.to_string(),
            "env:api_key": "secret"
        });
        let template = compile_run_command_template_from_config_values(&config_values.to_string())
            .expect("template");
        assert_eq!(template, "node ${api_key} -y");

        let resolved = compile_run_command_from_config_values(&config_values.to_string())
            .expect("resolved");
        assert_eq!(resolved, "export api_key=\"secret\" node ${api_key} -y");
    }
}
