use std::path::{Path, PathBuf};

use crate::agents::provider_for;
use crate::agents::types::path_to_string;
use crate::error::AppResult;

/// Expands a leading `~` to the process home directory.
pub fn expand_home_path(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if trimmed == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from("~"));
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(trimmed)
}

/// Default config dir for an agent kind: existing `mcp.json` first, else first existing directory.
pub fn resolve_auto_config_path(kind: &str) -> AppResult<Option<String>> {
    let provider = provider_for(kind)?;
    let candidates: Vec<PathBuf> = provider.candidate_config_dirs();

    for dir in &candidates {
        let config_path = provider.mcp_config_file_name();
        if dir.is_dir() && dir.join(config_path).is_file() {
            return Ok(Some(path_to_string(dir.clone())));
        }
    }

    for dir in &candidates {
        if dir.is_dir() {
            return Ok(Some(path_to_string(dir.clone())));
        }
    }

    Ok(None)
}

pub fn is_config_dir_valid(path: &str) -> bool {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return false;
    }
    expand_home_path(trimmed).is_dir()
}

pub fn normalize_config_dir_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("config_dir_path must not be empty".to_string());
    }
    Ok(path_to_string(expand_home_path(trimmed)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_home_path_handles_tilde_prefix() {
        let Some(home) = dirs::home_dir() else {
            return;
        };
        assert_eq!(
            expand_home_path("~/.cursor"),
            home.join(".cursor")
        );
    }

    #[test]
    fn resolve_cursor_path_prefers_existing_mcp_json_dir() {
        let resolved = resolve_auto_config_path("cursor").expect("cursor provider");
        let Some(path) = resolved else {
            return;
        };
        let dir = Path::new(&path);
        assert!(dir.is_dir(), "resolved cursor path should exist: {path}");
    }

    #[test]
    fn resolve_claude_does_not_return_missing_dot_claude() {
        let resolved = resolve_auto_config_path("claude-code").expect("claude provider");
        if let Some(path) = resolved {
            assert!(
                Path::new(&path).is_dir(),
                "resolved claude path must exist: {path}"
            );
            assert_ne!(
                path,
                dirs::home_dir()
                    .expect("home")
                    .join(".claude")
                    .to_string_lossy(),
                "should not return ~/.claude when it does not exist"
            );
        }
    }
}
