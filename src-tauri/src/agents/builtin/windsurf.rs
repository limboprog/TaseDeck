use super::paths::{dedupe_paths, home_dir};
use crate::agents::traits::AgentConfigProvider;
use std::path::PathBuf;

pub struct WindsurfAgent;

impl WindsurfAgent {
    pub fn new() -> Self {
        Self
    }
}

impl Default for WindsurfAgent {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentConfigProvider for WindsurfAgent {
    fn kind(&self) -> &'static str {
        "windsurf"
    }

    fn label(&self) -> &'static str {
        "Windsurf"
    }

    fn mcp_config_file_name(&self) -> &'static str {
        "mcp_config.json"
    }

    fn candidate_config_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Some(home) = home_dir() {
            dirs.push(home.join(".codeium").join("windsurf"));
            #[cfg(target_os = "windows")]
            {
                if let Some(app_data) = std::env::var_os("APPDATA") {
                    dirs.push(PathBuf::from(app_data).join("Codeium").join("windsurf"));
                }
            }
        }

        dedupe_paths(dirs)
    }
}
