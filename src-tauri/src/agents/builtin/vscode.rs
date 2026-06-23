use super::paths::{
    dedupe_paths, home_dir, push_linux_config, push_mac_app_support, push_windows_appdata,
};
use crate::agents::traits::AgentConfigProvider;
use std::path::PathBuf;

pub struct VsCodeAgent;

impl VsCodeAgent {
    pub fn new() -> Self {
        Self
    }
}

impl Default for VsCodeAgent {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentConfigProvider for VsCodeAgent {
    fn kind(&self) -> &'static str {
        "vscode"
    }

    fn label(&self) -> &'static str {
        "VS Code"
    }

    fn candidate_config_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Some(home) = home_dir() {
            dirs.push(home.join(".vscode"));
            #[cfg(target_os = "macos")]
            push_mac_app_support(&home, "Code", &mut dirs);
            #[cfg(target_os = "macos")]
            dirs.push(
                home.join("Library")
                    .join("Application Support")
                    .join("Code")
                    .join("User"),
            );
            #[cfg(target_os = "linux")]
            {
                push_linux_config(&home, "Code", &mut dirs);
                dirs.push(home.join(".config").join("Code").join("User"));
            }
            #[cfg(target_os = "windows")]
            {
                push_windows_appdata("Code", &mut dirs);
                if let Some(app_data) = std::env::var_os("APPDATA") {
                    dirs.push(
                        PathBuf::from(app_data)
                            .join("Code")
                            .join("User"),
                    );
                }
            }
        }

        dedupe_paths(dirs)
    }
}
