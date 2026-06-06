use super::paths::{
    dedupe_paths, home_dir, push_linux_config, push_mac_app_support, push_windows_appdata,
};
use crate::agents::traits::AgentConfigProvider;
use std::path::PathBuf;

pub struct AntigravityAgent;

impl AntigravityAgent {
    pub fn new() -> Self {
        Self
    }
}

impl AgentConfigProvider for AntigravityAgent {
    fn kind(&self) -> &'static str {
        "antigravity"
    }

    fn label(&self) -> &'static str {
        "Antigravity"
    }

    fn mcp_json_servers_key(&self) -> &'static str {
        "servers"
    }

    fn candidate_config_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();
        if let Some(home) = home_dir() {
            dirs.push(home.join(".antigravity"));
            dirs.push(home.join(".gemini").join("antigravity"));
            #[cfg(target_os = "macos")]
            push_mac_app_support(&home, "Antigravity", &mut dirs);
            #[cfg(target_os = "linux")]
            push_linux_config(&home, "antigravity", &mut dirs);
            #[cfg(target_os = "windows")]
            push_windows_appdata("Antigravity", &mut dirs);
        }
        dedupe_paths(dirs)
    }
}
