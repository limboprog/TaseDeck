use crate::core::app_settings::current_app_settings;
use crate::core::fs::{ensure_user_storage_dir, user_storage_dir};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeRuntimeStatus {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: String,
}

fn node_binary_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

pub fn configured_node_path() -> Option<PathBuf> {
    let settings = current_app_settings().ok()?;
    settings
        .node_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

pub fn resolve_node_executable() -> Option<PathBuf> {
    if let Some(path) = configured_node_path() {
        if path.is_file() {
            return Some(path);
        }
        let with_bin = path.join("bin").join(node_binary_name());
        if with_bin.is_file() {
            return Some(with_bin);
        }
    }

    detect_system_node()
}

pub fn detect_system_node() -> Option<PathBuf> {
    let command = if cfg!(windows) { "where" } else { "which" };
    let output = Command::new(command).arg("node").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let first = stdout.lines().next()?.trim();
    if first.is_empty() {
        return None;
    }
    let path = PathBuf::from(first);
    if path.is_file() {
        Some(path)
    } else {
        None
    }
}

pub fn validate_node_executable(path: &Path) -> Result<String, String> {
    if !path.is_file() {
        return Err(format!("Node.js binary not found at {}", path.display()));
    }
    let output = Command::new(path)
        .arg("--version")
        .output()
        .map_err(|error| format!("failed to run node --version: {error}"))?;
    if !output.status.success() {
        return Err("node --version exited with an error".to_string());
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        return Err("node --version returned empty output".to_string());
    }
    Ok(version)
}

pub fn node_runtime_status() -> NodeRuntimeStatus {
    if let Some(path) = resolve_node_executable() {
        let version = validate_node_executable(&path).ok();
        return NodeRuntimeStatus {
            found: true,
            path: Some(path.display().to_string()),
            version,
            source: if configured_node_path().is_some() {
                "settings".to_string()
            } else {
                "path".to_string()
            },
        };
    }
    NodeRuntimeStatus {
        found: false,
        path: configured_node_path().map(|path| path.display().to_string()),
        version: None,
        source: "missing".to_string(),
    }
}

#[derive(Debug, Deserialize)]
struct NodeDistIndexEntry {
    version: String,
    lts: serde_json::Value,
}

fn platform_archive_name(version: &str) -> Result<String, String> {
    let ver = version.trim_start_matches('v');
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        return Ok(format!("node-v{ver}-darwin-arm64.tar.gz"));
    }
    if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        return Ok(format!("node-v{ver}-darwin-x64.tar.gz"));
    }
    if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        return Ok(format!("node-v{ver}-linux-x64.tar.gz"));
    }
    if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        return Ok(format!("node-v{ver}-linux-arm64.tar.gz"));
    }
    if cfg!(windows) {
        return Ok(format!("node-v{ver}-win-x64.zip"));
    }
    Err("unsupported platform for automatic Node.js download".to_string())
}

fn latest_lts_version() -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;
    let entries: Vec<NodeDistIndexEntry> = client
        .get("https://nodejs.org/dist/index.json")
        .send()
        .map_err(|error| format!("failed to fetch Node.js release index: {error}"))?
        .json()
        .map_err(|error| format!("invalid Node.js release index: {error}"))?;

    for entry in &entries {
        if entry.lts.is_string() {
            return Ok(entry.version.clone());
        }
    }
    entries
        .first()
        .map(|entry| entry.version.clone())
        .ok_or_else(|| "Node.js release index is empty".to_string())
}

pub fn download_node_lts() -> Result<PathBuf, String> {
    ensure_user_storage_dir().map_err(|error| error.to_string())?;
    let version = latest_lts_version()?;
    let archive_name = platform_archive_name(&version)?;
    let url = format!("https://nodejs.org/dist/{version}/{archive_name}");
    let cache_dir = user_storage_dir().join("node-runtime");
    std::fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
    let archive_path = cache_dir.join(&archive_name);

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|error| error.to_string())?;
    let bytes = client
        .get(&url)
        .send()
        .map_err(|error| format!("failed to download Node.js: {error}"))?
        .bytes()
        .map_err(|error| format!("failed to read Node.js download: {error}"))?;
    std::fs::write(&archive_path, &bytes).map_err(|error| error.to_string())?;

    let extract_dir = cache_dir.join(version.trim_start_matches('v'));
    if extract_dir.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
    }
    std::fs::create_dir_all(&extract_dir).map_err(|error| error.to_string())?;

    if archive_name.ends_with(".tar.gz") {
        let status = Command::new("tar")
            .args(["-xzf", archive_path.to_string_lossy().as_ref(), "-C"])
            .arg(&extract_dir)
            .status()
            .map_err(|error| format!("failed to extract Node.js archive: {error}"))?;
        if !status.success() {
            return Err("tar failed to extract Node.js archive".to_string());
        }
    } else if archive_name.ends_with(".zip") {
        let status = Command::new("tar")
            .args(["-xf", archive_path.to_string_lossy().as_ref(), "-C"])
            .arg(&extract_dir)
            .status()
            .map_err(|error| format!("failed to extract Node.js zip: {error}"))?;
        if !status.success() {
            return Err("failed to extract Node.js zip archive".to_string());
        }
    } else {
        return Err(format!("unsupported Node.js archive: {archive_name}"));
    }

    let _ = std::fs::remove_file(&archive_path);

    let mut extracted_root = extract_dir.clone();
    if let Ok(entries) = std::fs::read_dir(&extract_dir) {
        let dirs: Vec<_> = entries.filter_map(|entry| entry.ok()).collect();
        if dirs.len() == 1 {
            if let Some(name) = dirs[0].file_name().to_str() {
                if name.starts_with("node-v") {
                    extracted_root = extract_dir.join(name);
                }
            }
        }
    }

    let node_path = extracted_root.join(node_binary_name());
    if !node_path.is_file() {
        return Err("downloaded Node.js archive did not contain a node binary".to_string());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&node_path) {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o755);
            let _ = std::fs::set_permissions(&node_path, permissions);
        }
    }

    Ok(node_path)
}
