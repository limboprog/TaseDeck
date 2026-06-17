use crate::core::shell::run_shell_checked;
use crate::error::{AppError, AppResult};
use crate::services::mcp_registry_install::RegistryServer;
use crate::services::{
    analyze_mcp_server, apply_compiled_run_command, build_registry_install_plan,
    mcp_server_for_runtime, probe_mcp_operation, McpProbeResult, McpServerAnalysis,
    RegistryEntry, RegistryInstallPlan,
};
use crate::db::McpServer;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

const DEFAULT_REGISTRY: &str = "https://registry.modelcontextprotocol.io";
const FLUSH_EVERY: usize = 15;
const REGISTRY_PAGE_SIZE: usize = 30;
const AUTH_OK_RESULT: &str = "Auth: OK";
const PROBE_OPERATION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);
const PROBE_HTTP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

#[derive(Debug, Clone)]
pub struct MarketProbeOptions {
    pub input_path: Option<PathBuf>,
    pub output_path: PathBuf,
    pub top: Option<usize>,
    pub limit: Option<usize>,
    /// When true, runs `npm install -g` / pip / etc. like Market → Add.
    pub install_packages: bool,
    pub registry_base_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeStepResult {
    pub success: bool,
    pub result: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProbeResult {
    pub name: String,
    pub registry_name: String,
    pub registry_key: String,
    pub stars: Option<u64>,
    pub install_command: Option<String>,
    pub server_type: String,
    pub run_command: String,
    pub path: Option<String>,
    pub analysis: Option<McpServerAnalysis>,
    pub tests: ProbeTests,
    pub tools_count: Option<usize>,
    pub tool_names: Vec<String>,
    pub errors: Vec<String>,
    pub probed_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeTests {
    pub initialize: ProbeStepResult,
    pub list: ProbeStepResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketProbeReport {
    pub started_at: String,
    pub updated_at: String,
    pub mode: String,
    pub input: Option<String>,
    pub output: String,
    pub registry_base_url: String,
    pub install_packages: bool,
    pub summary: MarketProbeSummary,
    pub servers: Vec<ServerProbeResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketProbeSummary {
    pub total: usize,
    pub completed: usize,
    pub passed_initialize: usize,
    pub passed_list: usize,
    pub got_tools: usize,
    pub with_errors: usize,
}

#[derive(Debug, Deserialize)]
struct TestsFile {
    servers: Vec<TestSpec>,
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct TestSpec {
    name: String,
    identifier: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RegistryListResponse {
    servers: Vec<RegistryListItem>,
    metadata: Option<RegistryListMetadata>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryListMetadata {
    next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RegistryListItem {
    server: Value,
}

struct RankedEntry {
    entry: RegistryEntry,
    stars: Option<u64>,
}

pub fn run_market_probe(options: MarketProbeOptions) -> AppResult<()> {
    let started_at = chrono_now();
    let entries = load_probe_entries(&options)?;
    let total = entries.len();

    let mut results: Vec<ServerProbeResult> = Vec::with_capacity(total);

    eprintln!(
        "Market probe: {} server(s), install_packages={}, flush every {}",
        total, options.install_packages, FLUSH_EVERY
    );

    for (index, ranked) in entries.into_iter().enumerate() {
        eprintln!(
            "\n[{}/{}] {} ({})",
            index + 1,
            total,
            ranked.entry.server.title.as_deref().unwrap_or(&ranked.entry.server.name),
            ranked.entry.server.name
        );

        let result = match probe_registry_entry(&ranked, options.install_packages) {
            Ok(result) => result,
            Err(error) => error_probe_result(&ranked.entry, ranked.stars, error.to_string()),
        };

        eprintln!(
            "  Initialize: {} | List: {} | tools: {}",
            format_step_status(&result.tests.initialize),
            format_step_status(&result.tests.list),
            result
                .tools_count
                .map(|count| count.to_string())
                .unwrap_or_else(|| "—".to_string())
        );

        results.push(result);

        if results.len() % FLUSH_EVERY == 0 || index + 1 == total {
            let report = build_report(
                &started_at,
                &options,
                &results,
                total,
            );
            write_report(&options.output_path, &report)?;
        }
    }

    let summary = summarize(&results);
    eprintln!("\n=== Summary ===");
    eprintln!("Completed: {}", summary.completed);
    eprintln!("Initialize OK: {}", summary.passed_initialize);
    eprintln!("List OK: {}", summary.passed_list);
    eprintln!("Got tools (>0): {}", summary.got_tools);
    eprintln!("With errors: {}", summary.with_errors);

    Ok(())
}

fn load_probe_entries(options: &MarketProbeOptions) -> AppResult<Vec<RankedEntry>> {
    if let Some(top) = options.top {
        return fetch_top_registry_entries(&options.registry_base_url, top);
    }

    let input_path = options
        .input_path
        .as_ref()
        .ok_or_else(|| AppError::Message("either --top or --input is required".to_string()))?;

    let raw = fs::read_to_string(input_path)?;
    let tests: TestsFile = serde_json::from_str(&raw).map_err(|error| {
        AppError::Message(format!("invalid tests.json: {error}"))
    })?;

    let client = http_client()?;
    let mut ranked = Vec::new();

    for spec in &tests.servers {
        let identifier = spec
            .identifier
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(spec.name.as_str());

        let entry = find_registry_entry(&client, &options.registry_base_url, identifier)?
            .ok_or_else(|| {
                AppError::Message(format!(
                    "registry entry not found for {} ({identifier})",
                    spec.name
                ))
            })?;

        ranked.push(RankedEntry {
            entry,
            stars: None,
        });
    }

    if let Some(limit) = options.limit {
        ranked.truncate(limit);
    }

    Ok(ranked)
}

fn fetch_top_registry_entries(base_url: &str, top: usize) -> AppResult<Vec<RankedEntry>> {
    let client = http_client()?;
    let catalog = fetch_registry_entries(&client, base_url, Some(top))?;

    eprintln!(
        "Registry: {} server(s) loaded, probing {}",
        catalog.len(),
        catalog.len()
    );

    Ok(catalog
        .into_iter()
        .map(|entry| RankedEntry {
            entry,
            stars: None,
        })
        .collect())
}

fn fetch_registry_entries(
    client: &Client,
    base_url: &str,
    max_count: Option<usize>,
) -> AppResult<Vec<RegistryEntry>> {
    let mut cursor: Option<String> = None;
    let mut entries = Vec::new();

    loop {
        if max_count.is_some_and(|limit| entries.len() >= limit) {
            break;
        }

        let mut url = format!(
            "{}/v0/servers?limit={REGISTRY_PAGE_SIZE}&version=latest",
            base_url.trim_end_matches('/')
        );
        if let Some(value) = cursor.as_deref().filter(|item| !item.trim().is_empty()) {
            url.push_str("&cursor=");
            url.push_str(&urlencoding::encode(value));
        }

        eprintln!("Registry: GET {url}");

        let response = client
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .map_err(|error| AppError::Message(format!("registry request failed: {error}")))?;

        if !response.status().is_success() {
            return Err(AppError::Message(format!(
                "registry HTTP {}",
                response.status()
            )));
        }

        let body: RegistryListResponse = response.json().map_err(|error| {
            AppError::Message(format!("registry JSON parse failed: {error}"))
        })?;

        for item in body.servers {
            if max_count.is_some_and(|limit| entries.len() >= limit) {
                break;
            }

            match parse_registry_server_value(item.server) {
                Ok(entry) => entries.push(entry),
                Err(error) => {
                    eprintln!("  skip entry: {error}");
                }
            }
        }

        if max_count.is_some_and(|limit| entries.len() >= limit) {
            break;
        }

        cursor = body
            .metadata
            .and_then(|metadata| metadata.next_cursor)
            .filter(|value| !value.trim().is_empty());

        if cursor.is_none() {
            break;
        }
    }

    if let Some(limit) = max_count {
        entries.truncate(limit);
    }

    Ok(entries)
}

fn parse_registry_server_value(mut server: Value) -> AppResult<RegistryEntry> {
    normalize_registry_server_json(&mut server);
    let server: RegistryServer = serde_json::from_value(server).map_err(|error| {
        AppError::Message(format!("invalid registry server json: {error}"))
    })?;
    Ok(RegistryEntry { server })
}

fn normalize_registry_server_json(server: &mut Value) {
    let Some(obj) = server.as_object_mut() else {
        return;
    };

    let Some(repo) = obj.get("repository") else {
        return;
    };

    let missing_url = repo
        .as_object()
        .map(|repository| {
            repository
                .get("url")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|url| !url.is_empty())
                .is_none()
        })
        .unwrap_or(true);

    if missing_url {
        obj.remove("repository");
    }
}

fn find_registry_entry(
    client: &Client,
    base_url: &str,
    identifier: &str,
) -> AppResult<Option<RegistryEntry>> {
    let target = identifier.trim().to_lowercase();
    let queries = [
        identifier.to_string(),
        identifier.trim_start_matches('@').to_string(),
        identifier
            .split('/')
            .next_back()
            .unwrap_or(identifier)
            .to_string(),
    ];

    let mut seen = std::collections::HashSet::new();

    for search in queries {
        if search.trim().is_empty() || !seen.insert(search.clone()) {
            continue;
        }

        let url = format!(
            "{}/v0/servers?search={}&limit=50&version=latest",
            base_url.trim_end_matches('/'),
            urlencoding::encode(search.trim())
        );

        let response = client
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .map_err(|error| AppError::Message(format!("registry search failed: {error}")))?;

        if !response.status().is_success() {
            continue;
        }

        let body: RegistryListResponse = match response.json() {
            Ok(value) => value,
            Err(_) => continue,
        };

        for item in body.servers {
            let Ok(entry) = parse_registry_server_value(item.server) else {
                continue;
            };
            if registry_item_matches(&entry.server, &target) {
                return Ok(Some(entry));
            }
        }
    }

    Ok(None)
}

fn registry_item_matches(server: &RegistryServer, target: &str) -> bool {
    if server.name.trim().to_lowercase() == target {
        return true;
    }
    if server
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value: &&str| !value.is_empty())
        .map(|value: &str| value.to_lowercase() == target)
        .unwrap_or(false)
    {
        return true;
    }

    for package in server.packages.as_deref().unwrap_or_default() {
        if package.identifier.trim().to_lowercase() == target {
            return true;
        }
    }

    for remote in server.remotes.as_deref().unwrap_or_default() {
        if remote.url.trim().to_lowercase() == target {
            return true;
        }
    }

    false
}

fn probe_registry_entry(ranked: &RankedEntry, install_packages: bool) -> AppResult<ServerProbeResult> {
    let entry = &ranked.entry;
    let registry_name = entry.server.name.clone();
    let display_name = entry
        .server
        .title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| registry_name.clone());
    let version = entry
        .server
        .version
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("latest");
    let registry_key = format!("{registry_name}:{version}");

    let plan = build_registry_install_plan(entry.clone()).map_err(|error| {
        AppError::Message(format!("build_registry_install_plan failed: {error}"))
    })?;

    let (mut server, install_command) = match plan {
        RegistryInstallPlan::Local(request) => {
            if install_packages {
                run_shell_checked(&request.install_command).map_err(|error| {
                    AppError::Message(format!("install failed: {error}"))
                })?;
            }
            (request.server, Some(request.install_command))
        }
        RegistryInstallPlan::Remote(server) => (server, None),
    };

    apply_compiled_run_command(&mut server)?;

    let analysis = analyze_mcp_server(&server).ok();
    let runtime = mcp_server_for_runtime(&server)?;

    let initialize = run_probe(&runtime, "initialize");
    let list = run_probe(&runtime, "tools_list");
    let (initialize, list) = apply_auth_fallback(&server, initialize, list);

    let mut errors = Vec::new();
    if !initialize.success {
        errors.push(format!("Initialize: {}", initialize.result));
    }
    if !list.success {
        errors.push(format!("List: {}", list.result));
    }

    let (tools_count, tool_names) = parse_tools_probe(&list.result);

    if list.success && list.result != AUTH_OK_RESULT && tools_count == Some(0) {
        errors.push("List succeeded but 0 tools returned".to_string());
    }

    Ok(ServerProbeResult {
        name: display_name,
        registry_name,
        registry_key,
        stars: ranked.stars,
        install_command,
        server_type: server.server_type.as_str().to_string(),
        run_command: server.run_command.clone(),
        path: server.path.clone(),
        analysis,
        tests: ProbeTests {
            initialize,
            list,
        },
        tools_count,
        tool_names,
        errors,
        probed_at: chrono_now(),
    })
}

fn run_probe(server: &McpServer, operation: &str) -> ProbeStepResult {
    let started = Instant::now();
    let McpProbeResult { success, result } =
        probe_mcp_operation(server, operation, None, Some(PROBE_OPERATION_TIMEOUT));
    ProbeStepResult {
        success,
        result,
        duration_ms: started.elapsed().as_millis() as u64,
    }
}

fn format_step_status(step: &ProbeStepResult) -> &'static str {
    if !step.success {
        return "FAIL";
    }
    if step.result == AUTH_OK_RESULT {
        "Auth: OK"
    } else {
        "OK"
    }
}

fn apply_auth_fallback(
    server: &McpServer,
    initialize: ProbeStepResult,
    list: ProbeStepResult,
) -> (ProbeStepResult, ProbeStepResult) {
    let init_needs_auth = !initialize.success && is_auth_related_probe_failure(&initialize.result);
    let list_needs_auth = !list.success && is_auth_related_probe_failure(&list.result);
    if !init_needs_auth && !list_needs_auth {
        return (initialize, list);
    }

    let endpoint_alive = probe_proves_endpoint_alive(&initialize.result)
        || probe_proves_endpoint_alive(&list.result)
        || endpoint_url(server)
            .as_deref()
            .map(check_url_reachable)
            .unwrap_or(false);

    if !endpoint_alive {
        return (initialize, list);
    }

    let auth_ok = ProbeStepResult {
        success: true,
        result: AUTH_OK_RESULT.to_string(),
        duration_ms: initialize.duration_ms.max(list.duration_ms),
    };

    let mut initialize = initialize;
    let mut list = list;
    if init_needs_auth {
        initialize = auth_ok.clone();
    }
    if list_needs_auth {
        list = auth_ok;
    }
    (initialize, list)
}

fn is_auth_related_probe_failure(result: &str) -> bool {
    if result.starts_with("MCP_AUTH_REQUIRED:") {
        return true;
    }

    let lower = result.to_ascii_lowercase();
    [
        "401 unauthorized",
        "authentication required",
        "unauthorized:",
        "unauthorized\"",
        "missing authentication",
        "missing or invalid authorization",
        "invalid or missing credentials",
        "invalid_token",
        "invalid_api_key",
        "authorization required",
        "missing authentication token",
        "invalid or missing api key",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn probe_proves_endpoint_alive(result: &str) -> bool {
    let lower = result.to_ascii_lowercase();
    lower.contains("http 401")
        || lower.contains("http 403")
        || lower.contains("tools/list failed:")
        || lower.contains("initialize ok")
}

fn endpoint_url(server: &McpServer) -> Option<String> {
    server
        .path
        .as_deref()
        .map(str::trim)
        .filter(|value| value.starts_with("http://") || value.starts_with("https://"))
        .map(str::to_string)
}

fn check_url_reachable(url: &str) -> bool {
    let client = match http_client() {
        Ok(client) => client,
        Err(_) => return false,
    };

    if client.head(url).send().is_ok() {
        return true;
    }

    client.get(url).send().is_ok()
}

fn parse_tools_probe(result: &str) -> (Option<usize>, Vec<String>) {
    let Some(rest) = result.strip_prefix("tools/list OK — ") else {
        return (None, Vec::new());
    };

    let mut parts = rest.splitn(2, " tools:");
    let count = parts.next().and_then(|value| value.trim().parse().ok());
    let names = parts
        .next()
        .map(|value| {
            value
                .split(',')
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect()
        })
        .unwrap_or_default();

    (count, names)
}

fn error_probe_result(entry: &RegistryEntry, stars: Option<u64>, message: String) -> ServerProbeResult {
    let registry_name = entry.server.name.clone();
    let display_name = entry
        .server
        .title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| registry_name.clone());
    let version = entry
        .server
        .version
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("latest");

    ServerProbeResult {
        name: display_name,
        registry_name,
        registry_key: format!("{}:{version}", entry.server.name),
        stars,
        install_command: None,
        server_type: "unknown".to_string(),
        run_command: String::new(),
        path: None,
        analysis: None,
        tests: ProbeTests {
            initialize: ProbeStepResult {
                success: false,
                result: message.clone(),
                duration_ms: 0,
            },
            list: ProbeStepResult {
                success: false,
                result: message.clone(),
                duration_ms: 0,
            },
        },
        tools_count: None,
        tool_names: Vec::new(),
        errors: vec![message],
        probed_at: chrono_now(),
    }
}

fn build_report(
    started_at: &str,
    options: &MarketProbeOptions,
    results: &[ServerProbeResult],
    total: usize,
) -> MarketProbeReport {
    MarketProbeReport {
        started_at: started_at.to_string(),
        updated_at: chrono_now(),
        mode: if options.top.is_some() {
            "top".to_string()
        } else {
            "input".to_string()
        },
        input: options
            .input_path
            .as_ref()
            .map(|path| path.display().to_string()),
        output: options.output_path.display().to_string(),
        registry_base_url: options.registry_base_url.clone(),
        install_packages: options.install_packages,
        summary: MarketProbeSummary {
            total,
            completed: results.len(),
            ..summarize(results)
        },
        servers: results.to_vec(),
    }
}

fn summarize(results: &[ServerProbeResult]) -> MarketProbeSummary {
    MarketProbeSummary {
        total: results.len(),
        completed: results.len(),
        passed_initialize: results
            .iter()
            .filter(|entry| entry.tests.initialize.success)
            .count(),
        passed_list: results.iter().filter(|entry| entry.tests.list.success).count(),
        got_tools: results
            .iter()
            .filter(|entry| entry.tools_count.unwrap_or(0) > 0)
            .count(),
        with_errors: results.iter().filter(|entry| !entry.errors.is_empty()).count(),
    }
}

fn write_report(path: &Path, report: &MarketProbeReport) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    let json = serde_json::to_string_pretty(report).map_err(|error| {
        AppError::Message(format!("failed to encode report: {error}"))
    })?;

    fs::write(path, format!("{json}\n"))?;
    eprintln!("\nSaved {} results → {}", report.servers.len(), path.display());
    Ok(())
}

fn http_client() -> AppResult<Client> {
    Client::builder()
        .timeout(PROBE_HTTP_TIMEOUT)
        .build()
        .map_err(|error| AppError::Message(format!("HTTP client error: {error}")))
}

fn chrono_now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn parse_cli_args(args: &[String]) -> AppResult<MarketProbeOptions> {
    let mut input_path: Option<PathBuf> = None;
    let mut output_path = PathBuf::from("test/result.json");
    let mut top: Option<usize> = None;
    let mut limit: Option<usize> = None;
    let mut install_packages = false;
    let mut registry_base_url = DEFAULT_REGISTRY.to_string();

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--input" => {
                index += 1;
                input_path = Some(PathBuf::from(required_arg(args, index, "--input")?));
            }
            "--output" => {
                index += 1;
                output_path = PathBuf::from(required_arg(args, index, "--output")?);
            }
            "--top" => {
                index += 1;
                top = Some(
                    required_arg(args, index, "--top")?
                        .parse()
                        .map_err(|_| AppError::Message("--top requires a number".to_string()))?,
                );
            }
            "--limit" => {
                index += 1;
                limit = Some(
                    required_arg(args, index, "--limit")?
                        .parse()
                        .map_err(|_| AppError::Message("--limit requires a number".to_string()))?,
                );
            }
            "--install" => {
                install_packages = true;
            }
            "--registry" => {
                index += 1;
                registry_base_url = required_arg(args, index, "--registry")?.to_string();
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            other => {
                return Err(AppError::Message(format!("unknown argument: {other}")));
            }
        }
        index += 1;
    }

    if top.is_some() && input_path.is_some() {
        return Err(AppError::Message(
            "use either --top or --input, not both".to_string(),
        ));
    }

    if top.is_none() && input_path.is_none() {
        input_path = Some(PathBuf::from("test/tests.json"));
    }

    Ok(MarketProbeOptions {
        input_path,
        output_path,
        top,
        limit,
        install_packages,
        registry_base_url,
    })
}

fn required_arg(args: &[String], index: usize, flag: &str) -> AppResult<String> {
    args.get(index)
        .cloned()
        .ok_or_else(|| AppError::Message(format!("missing value for {flag}")))
}

fn print_help() {
    eprintln!(
        r#"TaseDeck market probe — same pipeline as Market → Add (Rust backend).

Usage:
  cargo run --bin market-probe -- --top 10
  cargo run --bin market-probe -- --input test/tests.json --output test/result.json
  node test/run-market-probes.mjs --top 5

Options:
  --top N          Paginate MCP registry (like Market), probe first N entries in catalog order
  --input PATH     Probe servers listed in tests.json (resolved via registry)
  --output PATH    Write incremental JSON report (default: test/result.json)
  --limit N        Cap servers when using --input
  --install        Run package install commands like Market → Add (npm install -g, etc.)
  --registry URL   Registry base URL (default: {DEFAULT_REGISTRY})
"#
    );
}
