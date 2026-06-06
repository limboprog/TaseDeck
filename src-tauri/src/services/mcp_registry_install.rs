use crate::db::{InstallMcpLocalRequest, McpServer, McpServerType};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

const RUN_COMMANDS_CONFIG_KEY: &str = "__runCommands";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub server: RegistryServer,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryServer {
    pub name: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub packages: Option<Vec<RegistryPackage>>,
    pub remotes: Option<Vec<RegistryRemote>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryPackage {
    pub registry_type: String,
    pub identifier: String,
    pub version: Option<String>,
    pub runtime_hint: Option<String>,
    pub runtime_arguments: Option<Vec<RegistryArgument>>,
    pub package_arguments: Option<Vec<RegistryArgument>>,
    pub environment_variables: Option<Vec<RegistryEnvVariable>>,
    pub transport: Option<RegistryTransport>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryTransport {
    #[serde(rename = "type")]
    pub transport_type: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryArgument {
    pub name: Option<String>,
    pub value: Option<String>,
    pub value_hint: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub argument_type: Option<String>,
    pub is_required: Option<bool>,
    pub is_secret: Option<bool>,
    pub default: Option<String>,
    pub placeholder: Option<String>,
    pub variables: Option<HashMap<String, RegistryInputVariable>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryInputVariable {
    pub description: Option<String>,
    pub is_required: Option<bool>,
    pub is_secret: Option<bool>,
    pub default: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEnvVariable {
    pub name: String,
    pub description: Option<String>,
    pub value: Option<String>,
    pub is_required: Option<bool>,
    pub is_secret: Option<bool>,
    pub default: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryRemote {
    #[serde(rename = "type")]
    pub remote_type: Option<String>,
    pub url: String,
    pub headers: Option<Vec<RegistryRemoteHeader>>,
    pub variables: Option<HashMap<String, RegistryInputVariable>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryRemoteHeader {
    pub name: String,
    pub description: Option<String>,
    pub value: Option<String>,
    pub is_required: Option<bool>,
    pub is_secret: Option<bool>,
}

pub enum RegistryInstallPlan {
    Local(InstallMcpLocalRequest),
    Remote(McpServer),
}

pub fn build_registry_install_plan(entry: RegistryEntry) -> AppResult<RegistryInstallPlan> {
    if let Some(pkg) = entry.server.packages.as_ref().and_then(|items| items.first()) {
        return Ok(RegistryInstallPlan::Local(build_local_install(&entry.server, pkg)?));
    }

    if let Some(remote) = entry.server.remotes.as_ref().and_then(|items| items.first()) {
        return Ok(RegistryInstallPlan::Remote(build_remote_server(
            &entry.server, remote, 0,
        )?));
    }

    Err(AppError::Message(
        "This server has no addable configuration.".to_string(),
    ))
}

fn build_local_install(
    server: &RegistryServer,
    pkg: &RegistryPackage,
) -> AppResult<InstallMcpLocalRequest> {
    let inputs = collect_package_inputs(pkg);
    let values = default_input_values(&inputs);
    let run = build_run_command_parts(pkg, &values)?;
    let run_commands = build_registry_run_commands_state(pkg, &run.shell);
    let mut config_values = values.clone();
    config_values.insert(
        RUN_COMMANDS_CONFIG_KEY.to_string(),
        serde_json::to_string(&run_commands).map_err(|error| {
            AppError::Message(format!("failed to encode run commands: {error}"))
        })?,
    );

    Ok(InstallMcpLocalRequest {
        install_command: build_install_command(pkg),
        server: McpServer {
            id: 0,
            name: server
                .title
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| server.name.clone()),
            server_type: McpServerType::Local,
            path: Some(pkg.identifier.clone()),
            run_command: run.shell,
            json_config: run.mcp_json,
            config_inputs: serde_json::to_string(&inputs).map_err(|error| {
                AppError::Message(format!("failed to encode config inputs: {error}"))
            })?,
            config_values: serde_json::to_string(&config_values).map_err(|error| {
                AppError::Message(format!("failed to encode config values: {error}"))
            })?,
            description: server
                .description
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    "Installed MCP server for agent tools and integrations.".to_string()
                }),
            created_at: String::new(),
            updated_at: String::new(),
        },
    })
}

fn build_remote_server(
    server: &RegistryServer,
    remote: &RegistryRemote,
    index: usize,
) -> AppResult<McpServer> {
    let inputs = collect_remote_inputs(remote, index);
    let values = default_input_values(&inputs);
    let json_config = build_remote_connection(server, remote, index, &values)?;

    Ok(McpServer {
        id: 0,
        name: server
            .title
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| server.name.clone()),
        server_type: McpServerType::Remote,
        path: Some(remote.url.clone()),
        run_command: String::new(),
        json_config,
        config_inputs: serde_json::to_string(&inputs).map_err(|error| {
            AppError::Message(format!("failed to encode config inputs: {error}"))
        })?,
        config_values: serde_json::to_string(&values).map_err(|error| {
            AppError::Message(format!("failed to encode config values: {error}"))
        })?,
        description: server
            .description
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                "Installed MCP server for agent tools and integrations.".to_string()
            }),
        created_at: String::new(),
        updated_at: String::new(),
    })
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigInput {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    is_required: bool,
    is_secret: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    placeholder: Option<String>,
    source: String,
}

struct BuiltRun {
    shell: String,
    mcp_json: String,
}

fn server_config_key(name: &str) -> String {
    let slug = name.split('/').next_back().unwrap_or(name);
    slug.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .to_lowercase()
}

fn package_version_ref(pkg: &RegistryPackage) -> String {
    let version = pkg.version.as_deref().unwrap_or("latest");
    if version == "latest" {
        return pkg.identifier.clone();
    }
    if pkg.registry_type == "pypi" {
        return format!("{}=={}", pkg.identifier, version);
    }
    format!("{}@{}", pkg.identifier, version)
}

fn uvx_package_ref(pkg: &RegistryPackage) -> String {
    let version = pkg.version.as_deref().unwrap_or("latest");
    if version == "latest" {
        pkg.identifier.clone()
    } else {
        format!("{}@{}", pkg.identifier, version)
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

fn build_install_command(pkg: &RegistryPackage) -> String {
    let reference = package_version_ref(pkg);
    match pkg.registry_type.as_str() {
        "npm" => format!("npm install -g {reference}"),
        "pypi" => format!("pip install {reference}"),
        "nuget" => {
            if let Some(version) = pkg.version.as_deref().filter(|value| *value != "latest") {
                format!(
                    "dotnet tool install --global {} --version {}",
                    pkg.identifier, version
                )
            } else {
                format!("dotnet tool install --global {}", pkg.identifier)
            }
        }
        "oci" => format!("docker pull {}", pkg.identifier),
        "mcpb" => format!(
            "curl -L -o \"$(basename \"{}\")\" \"{}\"",
            pkg.identifier, pkg.identifier
        ),
        other => format!("# Install via {other}: {reference}"),
    }
}

fn read_value(values: &HashMap<String, String>, keys: &[&str], fallback: Option<&str>) -> Option<String> {
    for key in keys {
        if let Some(value) = values.get(*key) {
            if !value.is_empty() {
                return Some(value.clone());
            }
        }
    }
    fallback.map(str::to_string)
}

fn default_input_values(inputs: &[ConfigInput]) -> HashMap<String, String> {
    let mut values = HashMap::new();
    for input in inputs {
        if let Some(default_value) = input.default_value.as_ref().filter(|value| !value.is_empty())
        {
            values.insert(input.id.clone(), default_value.clone());
        }
    }
    values
}

fn collect_package_inputs(pkg: &RegistryPackage) -> Vec<ConfigInput> {
    let mut inputs = Vec::new();
    for env in pkg.environment_variables.iter().flatten() {
        inputs.push(ConfigInput {
            id: format!("env:{}", env.name),
            name: env.name.clone(),
            description: env.description.clone(),
            is_required: env.is_required.unwrap_or(false),
            is_secret: env.is_secret.unwrap_or(false),
            default_value: env.default.clone().or_else(|| env.value.clone()),
            placeholder: None,
            source: "environment".to_string(),
        });
    }
    collect_argument_inputs(pkg.runtime_arguments.as_deref().unwrap_or(&[]), "runtime", &mut inputs);
    collect_argument_inputs(pkg.package_arguments.as_deref().unwrap_or(&[]), "package", &mut inputs);
    inputs
}

fn collect_argument_inputs(args: &[RegistryArgument], prefix: &str, inputs: &mut Vec<ConfigInput>) {
    for (index, arg) in args.iter().enumerate() {
        let path = format!("{prefix}:{index}");
        if let Some(variables) = &arg.variables {
            for (var_name, variable) in variables {
                inputs.push(ConfigInput {
                    id: format!("var:{path}:{var_name}"),
                    name: var_name.clone(),
                    description: variable.description.clone(),
                    is_required: variable.is_required.unwrap_or(false),
                    is_secret: variable.is_secret.unwrap_or(false),
                    default_value: variable.default.clone(),
                    placeholder: None,
                    source: "argument".to_string(),
                });
            }
        }

        if arg.argument_type.as_deref() == Some("positional") {
            let key = arg
                .value_hint
                .clone()
                .unwrap_or_else(|| format!("positional-{index}"));
            if arg.is_required.unwrap_or(false) && arg.value.as_deref().unwrap_or("").is_empty() {
                inputs.push(ConfigInput {
                    id: format!("arg:{path}:{key}"),
                    name: key,
                    description: arg.description.clone(),
                    is_required: true,
                    is_secret: arg.is_secret.unwrap_or(false),
                    default_value: arg.default.clone(),
                    placeholder: arg.placeholder.clone(),
                    source: "argument".to_string(),
                });
            }
            continue;
        }

        if arg.argument_type.as_deref() == Some("named")
            && arg.is_required.unwrap_or(false)
            && arg.value.as_deref().unwrap_or("").is_empty()
        {
            if let Some(name) = arg.name.as_ref().filter(|value| !value.is_empty()) {
                inputs.push(ConfigInput {
                    id: format!("arg:{path}:{name}"),
                    name: name.clone(),
                    description: arg.description.clone(),
                    is_required: true,
                    is_secret: arg.is_secret.unwrap_or(false),
                    default_value: arg.default.clone(),
                    placeholder: arg.placeholder.clone(),
                    source: "argument".to_string(),
                });
            }
        }
    }
}

fn collect_remote_inputs(remote: &RegistryRemote, index: usize) -> Vec<ConfigInput> {
    let mut inputs = Vec::new();
    for header in remote.headers.iter().flatten() {
        if header.is_required.unwrap_or(false) {
            inputs.push(ConfigInput {
                id: format!("header:{index}:{}", header.name),
                name: header.name.clone(),
                description: header.description.clone(),
                is_required: true,
                is_secret: header.is_secret.unwrap_or(false),
                default_value: header.value.clone(),
                placeholder: None,
                source: "header".to_string(),
            });
        }
    }
    for (name, variable) in remote.variables.iter().flatten() {
        if variable.is_required.unwrap_or(false) {
            inputs.push(ConfigInput {
                id: format!("remote-var:{index}:{name}"),
                name: name.clone(),
                description: variable.description.clone(),
                is_required: true,
                is_secret: variable.is_secret.unwrap_or(false),
                default_value: variable.default.clone(),
                placeholder: None,
                source: "remote-variable".to_string(),
            });
        }
    }
    inputs
}

fn escape_shell(value: &str) -> String {
    value.replace('"', "\\\"")
}

fn build_shell_command(command: &str, args: &[String], env: &HashMap<String, String>) -> String {
    let env_prefix = env
        .iter()
        .map(|(name, value)| format!("{name}=\"{}\"", escape_shell(value)))
        .collect::<Vec<_>>()
        .join(" ");
    let cmd = std::iter::once(command.to_string())
        .chain(args.iter().cloned())
        .collect::<Vec<_>>()
        .join(" ");
    if env_prefix.is_empty() {
        cmd
    } else {
        format!("{env_prefix} {cmd}")
    }
}

fn resolve_argument_value(
    arg: &RegistryArgument,
    path: &str,
    values: &HashMap<String, String>,
) -> Option<String> {
    if arg.argument_type.as_deref() == Some("positional") {
        let hint = arg
            .value_hint
            .clone()
            .unwrap_or_else(|| path.to_string());
        let resolved = read_value(
            values,
            &[&format!("arg:{path}:{hint}"), &hint],
            arg.value.as_deref().or(arg.default.as_deref()),
        )?;
        if resolved.is_empty() {
            return if arg.is_required.unwrap_or(false) {
                Some(format!("<{hint}>"))
            } else {
                None
            };
        }
        return Some(resolved);
    }

    let flag = arg.name.clone().unwrap_or_default();
    if flag.is_empty() {
        return None;
    }

    if let Some(value) = arg.value.as_ref().filter(|entry| !entry.is_empty()) {
        return Some(value.clone());
    }

    let user_value = read_value(
        values,
        &[&format!("arg:{path}:{flag}"), &flag],
        arg.default.as_deref(),
    );
    if let Some(user_value) = user_value.filter(|entry| !entry.is_empty()) {
        if flag.starts_with("--") {
            return Some(format!("{flag} {user_value}"));
        }
        return Some(format!("--{flag} {user_value}"));
    }

    if arg.is_required.unwrap_or(false) {
        return Some(if flag.starts_with("--") {
            format!("{flag} <value>")
        } else {
            format!("--{flag} <value>")
        });
    }

    None
}

fn expand_arguments(
    args: &[RegistryArgument],
    prefix: &str,
    values: &HashMap<String, String>,
) -> Vec<String> {
    let mut tokens = Vec::new();
    for (index, arg) in args.iter().enumerate() {
        let path = format!("{prefix}:{index}");
        let Some(resolved) = resolve_argument_value(arg, &path, values) else {
            continue;
        };
        tokens.push(resolved);
    }
    tokens
}

fn collect_env_record(pkg: &RegistryPackage, values: &HashMap<String, String>) -> HashMap<String, String> {
    let mut env = HashMap::new();
    for variable in pkg.environment_variables.iter().flatten() {
        let value = read_value(
            values,
            &[&format!("env:{}", variable.name), &variable.name],
            variable.default.as_deref().or(variable.value.as_deref()),
        );
        if let Some(value) = value.filter(|entry| !entry.is_empty()) {
            env.insert(variable.name.clone(), value);
        }
    }
    env
}

fn build_run_command_parts(pkg: &RegistryPackage, values: &HashMap<String, String>) -> AppResult<BuiltRun> {
    let runtime_hint = pkg
        .runtime_hint
        .clone()
        .or_else(|| default_runtime_hint(&pkg.registry_type).map(str::to_string))
        .unwrap_or_else(|| pkg.identifier.clone());
    let runtime_args = expand_arguments(pkg.runtime_arguments.as_deref().unwrap_or(&[]), "runtime", values);
    let package_args = expand_arguments(pkg.package_arguments.as_deref().unwrap_or(&[]), "package", values);
    let env = collect_env_record(pkg, values);

    if let Some(transport) = &pkg.transport {
        if transport.transport_type.as_deref() != Some("stdio") {
            if let Some(url) = transport.url.as_ref().filter(|value| !value.is_empty()) {
                let shell = build_shell_command(&runtime_hint, &[url.clone()], &env);
                let config = json!({
                    "mcpServers": {
                        "local": {
                            "url": url,
                            "type": transport.transport_type,
                        }
                    }
                });
                return Ok(BuiltRun {
                    shell,
                    mcp_json: serde_json::to_string_pretty(&config).map_err(|error| {
                        AppError::Message(format!("failed to encode mcp json: {error}"))
                    })?,
                });
            }
        }
    }

    let mut command = runtime_hint.clone();
    let mut args = Vec::new();

    match pkg.registry_type.as_str() {
        "npm" if runtime_hint == "npx" || pkg.registry_type == "npm" => {
            command = "npx".to_string();
            args.push("-y".to_string());
            args.extend(runtime_args);
            args.push(package_version_ref(pkg));
            args.extend(package_args);
        }
        "pypi" if runtime_hint == "uvx" || pkg.registry_type == "pypi" => {
            command = "uvx".to_string();
            args.extend(runtime_args);
            args.push(uvx_package_ref(pkg));
            args.extend(package_args);
        }
        "nuget" if runtime_hint == "dnx" || pkg.registry_type == "nuget" => {
            command = "dnx".to_string();
            args.extend(runtime_args);
            args.push(package_version_ref(pkg));
            if !package_args.is_empty() {
                args.push("--".to_string());
                args.extend(package_args);
            }
        }
        "oci" if runtime_hint == "docker" || pkg.registry_type == "oci" => {
            command = "docker".to_string();
            if runtime_args.is_empty() {
                args.extend(["run".to_string(), "-i".to_string(), "--rm".to_string()]);
            } else {
                args.extend(runtime_args);
            }
            args.push(pkg.identifier.clone());
            args.extend(package_args);
        }
        _ => {
            args.extend(runtime_args);
            args.push(package_version_ref(pkg));
            args.extend(package_args);
        }
    }

    args.retain(|entry| !entry.is_empty());
    let shell = build_shell_command(&command, &args, &env);
    let key = server_config_key(&pkg.identifier);
    let mut server_config = Map::new();
    server_config.insert("command".to_string(), Value::String(command.clone()));
    server_config.insert(
        "args".to_string(),
        Value::Array(args.iter().cloned().map(Value::String).collect()),
    );
    if !env.is_empty() {
        server_config.insert(
            "env".to_string(),
            Value::Object(
                env.into_iter()
                    .map(|(name, value)| (name, Value::String(value)))
                    .collect(),
            ),
        );
    }
    let mut mcp_servers = Map::new();
    mcp_servers.insert(key, Value::Object(server_config));
    let root = json!({ "mcpServers": Value::Object(mcp_servers) });

    Ok(BuiltRun {
        shell,
        mcp_json: serde_json::to_string_pretty(&root).map_err(|error| {
            AppError::Message(format!("failed to encode mcp json: {error}"))
        })?,
    })
}

fn build_remote_connection(
    server: &RegistryServer,
    remote: &RegistryRemote,
    index: usize,
    values: &HashMap<String, String>,
) -> AppResult<String> {
    let key = server_config_key(&server.name);
    let url = resolve_remote_url(remote, index, values);
    let mut headers = Map::new();
    for header in remote.headers.iter().flatten() {
        let value = read_value(
            values,
            &[&format!("header:{index}:{}", header.name), &header.name],
            header.value.as_deref(),
        );
        if let Some(value) = value.filter(|entry| !entry.is_empty()) {
            headers.insert(header.name.clone(), Value::String(value));
        }
    }

    let mut config = Map::new();
    config.insert("url".to_string(), Value::String(url));
    if let Some(remote_type) = remote.remote_type.as_ref().filter(|value| !value.is_empty()) {
        config.insert("type".to_string(), Value::String(remote_type.clone()));
    }
    if !headers.is_empty() {
        config.insert("headers".to_string(), Value::Object(headers));
    }

    let mut mcp_servers = Map::new();
    mcp_servers.insert(key, Value::Object(config));
    serde_json::to_string_pretty(&json!({ "mcpServers": Value::Object(mcp_servers) }))
        .map_err(|error| AppError::Message(format!("failed to encode remote config: {error}")))
}

fn resolve_remote_url(remote: &RegistryRemote, index: usize, values: &HashMap<String, String>) -> String {
    let mut result = remote.url.clone();
    while let Some(start) = result.find('{') {
        let Some(end) = result[start + 1..].find('}') else {
            break;
        };
        let end = start + 1 + end;
        let token = &result[start + 1..end];
        let replacement = read_value(
            values,
            &[
                &format!("remote-var:{index}:{token}"),
                &format!("header:{index}:{token}"),
                token,
            ],
            None,
        )
        .unwrap_or_else(|| format!("{{{token}}}"));
        result.replace_range(start..=end, &replacement);
    }
    result
}

fn create_run_command_id(prefix: &str) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("{prefix}-{millis}")
}

fn build_registry_run_commands_state(pkg: &RegistryPackage, primary_shell: &str) -> Value {
    let primary_id = create_run_command_id("run");
    let mut commands = vec![json!({
        "id": primary_id,
        "transport": "stdio",
        "command": primary_shell,
        "args": [],
    })];

    if pkg.registry_type == "npm" {
        let npm_shell = build_npm_exec_shell(pkg);
        if npm_shell != primary_shell {
            commands.push(json!({
                "id": create_run_command_id("run"),
                "transport": "stdio",
                "command": npm_shell,
                "args": [],
            }));
        }
    }

    json!({
        "activeId": primary_id,
        "commands": commands,
        "sharedArgs": [],
    })
}

fn build_npm_exec_shell(pkg: &RegistryPackage) -> String {
    let reference = package_version_ref(pkg);
    format!("npm exec --yes --package={reference} -- {reference}")
}
