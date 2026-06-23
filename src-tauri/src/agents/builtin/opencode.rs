use super::paths::{dedupe_paths, home_dir, push_linux_config, push_mac_app_support};
use crate::agents::traits::AgentConfigProvider;
use std::path::PathBuf;

pub struct OpenCodeAgent;

impl OpenCodeAgent {
    pub fn new() -> Self {
        Self
    }
}

impl Default for OpenCodeAgent {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentConfigProvider for OpenCodeAgent {
    fn kind(&self) -> &'static str {
        "opencode"
    }

    fn label(&self) -> &'static str {
        "OpenCode"
    }

    fn mcp_json_servers_key(&self) -> &'static str {
        "mcp"
    }

    fn mcp_config_file_name(&self) -> &'static str {
        "opencode.json"
    }

    fn candidate_config_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Some(home) = home_dir() {
            dirs.push(home.join(".config").join("opencode"));
            dirs.push(home.join(".opencode"));
            #[cfg(target_os = "macos")]
            push_mac_app_support(&home, "opencode", &mut dirs);
            #[cfg(target_os = "linux")]
            push_linux_config(&home, "opencode", &mut dirs);
        }

        dedupe_paths(dirs)
    }
}
