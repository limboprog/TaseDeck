use super::paths::{
    dedupe_paths, home_dir, push_linux_config, push_mac_app_support, push_windows_appdata,
};
use crate::agents::traits::AgentConfigProvider;
use std::path::PathBuf;

pub struct CopilotAgent;

impl CopilotAgent {
    pub fn new() -> Self {
        Self
    }
}

impl AgentConfigProvider for CopilotAgent {
    fn kind(&self) -> &'static str {
        "copilot"
    }

    fn label(&self) -> &'static str {
        "Copilot"
    }

    fn mcp_json_servers_key(&self) -> &'static str {
        "servers"
    }

    fn candidate_config_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();
        if let Some(home) = home_dir() {
            dirs.push(home.join(".copilot"));
            dirs.push(home.join(".config").join("github-copilot"));
            #[cfg(target_os = "macos")]
            {
                push_mac_app_support(&home, "GitHub Copilot", &mut dirs);
                push_mac_app_support(&home, "Code", &mut dirs);
            }
            #[cfg(target_os = "linux")]
            {
                push_linux_config(&home, "github-copilot", &mut dirs);
                push_linux_config(&home, "Code", &mut dirs);
            }
            #[cfg(target_os = "windows")]
            {
                push_windows_appdata("GitHub Copilot", &mut dirs);
                push_windows_appdata("Code", &mut dirs);
            }
        }
        dedupe_paths(dirs)
    }
}
