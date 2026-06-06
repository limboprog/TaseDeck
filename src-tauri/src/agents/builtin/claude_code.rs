use super::paths::{
    dedupe_paths, home_dir, push_linux_config, push_mac_app_support, push_windows_appdata,
};
use crate::agents::traits::AgentConfigProvider;
use std::path::PathBuf;

pub struct ClaudeCodeAgent;

impl ClaudeCodeAgent {
    pub fn new() -> Self {
        Self
    }
}

impl AgentConfigProvider for ClaudeCodeAgent {
    fn kind(&self) -> &'static str {
        "claude-code"
    }

    fn label(&self) -> &'static str {
        "Claude Code"
    }

    fn mcp_json_servers_key(&self) -> &'static str {
        "servers"
    }

    fn candidate_config_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();
        if let Some(home) = home_dir() {
            dirs.push(home.join(".claude"));
            #[cfg(target_os = "macos")]
            push_mac_app_support(&home, "Claude", &mut dirs);
            #[cfg(target_os = "linux")]
            {
                push_linux_config(&home, "claude", &mut dirs);
                dirs.push(home.join(".claude-code"));
            }
            #[cfg(target_os = "windows")]
            push_windows_appdata("Claude", &mut dirs);
        }
        dedupe_paths(dirs)
    }
}
