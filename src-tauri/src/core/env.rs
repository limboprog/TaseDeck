use crate::core::node_runtime::resolve_node_executable;
use crate::core::process::hidden_command;
use std::collections::HashSet;
use std::env;
use std::path::PathBuf;
use std::process::Command;

/// Shell used to run install scripts and MCP commands.
/// Login shell on Unix loads nvm/fnm/homebrew from the user's profile.
pub fn shell_command_builder() -> Command {
    #[cfg(windows)]
    {
        let mut command = hidden_command("cmd");
        command.arg("/C");
        command
    }
    #[cfg(not(windows))]
    {
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut command = Command::new(shell);
        command.arg("-l").arg("-c");
        command
    }
}

pub fn apply_process_env(command: &mut Command) {
    command.envs(env::vars());
    command.env("PATH", enriched_path());
}

pub fn enriched_path() -> String {
    let current = env::var("PATH").unwrap_or_default();
    let separator = if cfg!(windows) { ';' } else { ':' };

    let mut seen = HashSet::new();
    let mut parts = Vec::new();

    for prefix in path_prefixes() {
        let normalized = prefix.to_string_lossy().into_owned();
        if normalized.is_empty() {
            continue;
        }
        if seen.insert(normalized.clone()) {
            parts.push(normalized);
        }
    }

    if let Some(node_path) = resolve_node_executable() {
        if let Some(parent) = node_path.parent() {
            let normalized = parent.to_string_lossy().into_owned();
            if !normalized.is_empty() && seen.insert(normalized.clone()) {
                parts.insert(0, normalized);
            }
        }
    }

    for segment in current.split(separator) {
        let trimmed = segment.trim();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            parts.push(trimmed.to_string());
        }
    }

    parts.join(if cfg!(windows) { ";" } else { ":" })
}

fn path_prefixes() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    #[cfg(target_os = "macos")]
    {
        paths.push(PathBuf::from("/opt/homebrew/bin"));
        paths.push(PathBuf::from("/opt/homebrew/sbin"));
        paths.push(PathBuf::from("/usr/local/bin"));
    }

    #[cfg(target_os = "linux")]
    {
        paths.push(PathBuf::from("/usr/local/bin"));
    }

    if let Some(home) = dirs::home_dir() {
        #[cfg(not(windows))]
        {
            paths.push(home.join(".volta/bin"));
            paths.push(home.join(".local/bin"));
            paths.push(home.join(".fnm/current/bin"));
            append_nvm_node_bins(&home, &mut paths);
        }

        #[cfg(windows)]
        {
            paths.push(home.join("AppData\\Roaming\\npm"));
            if let Ok(local) = env::var("LOCALAPPDATA") {
                paths.push(PathBuf::from(local).join("fnm_multishells"));
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(program_files) = env::var("ProgramFiles") {
            paths.push(PathBuf::from(program_files).join("nodejs"));
        }
        if let Ok(program_files_x86) = env::var("ProgramFiles(x86)") {
            paths.push(PathBuf::from(program_files_x86).join("nodejs"));
        }
    }

    paths
}

#[cfg(not(windows))]
fn append_nvm_node_bins(home: &PathBuf, paths: &mut Vec<PathBuf>) {
    let versions_dir = home.join(".nvm/versions/node");
    let Ok(entries) = std::fs::read_dir(&versions_dir) else {
        return;
    };

    let mut bins: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path().join("bin"))
        .filter(|path| path.is_dir())
        .collect();
    bins.sort();
    paths.extend(bins);
}
