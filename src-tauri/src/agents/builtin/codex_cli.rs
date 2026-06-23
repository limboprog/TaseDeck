use super::paths::{dedupe_paths, home_dir};
use crate::agents::traits::AgentConfigProvider;
use std::path::PathBuf;

pub struct CodexCliAgent;

impl CodexCliAgent {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CodexCliAgent {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentConfigProvider for CodexCliAgent {
    fn kind(&self) -> &'static str {
        "codex-cli"
    }

    fn label(&self) -> &'static str {
        "Codex CLI"
    }

    fn mcp_config_file_name(&self) -> &'static str {
        "config.toml"
    }

    fn candidate_config_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Some(home) = home_dir() {
            dirs.push(home.join(".codex"));
        }

        dedupe_paths(dirs)
    }
}
