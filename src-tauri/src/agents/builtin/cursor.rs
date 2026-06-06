use super::paths::{
    dedupe_paths, home_dir, push_linux_config, push_mac_app_support, push_windows_appdata,
};
use crate::agents::traits::AgentConfigProvider;
use std::path::PathBuf;

pub struct CursorAgent;

impl CursorAgent {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CursorAgent {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentConfigProvider for CursorAgent {
    fn kind(&self) -> &'static str {
        "cursor"
    }

    fn label(&self) -> &'static str {
        "Cursor"
    }

    fn candidate_config_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Some(home) = home_dir() {
            dirs.push(home.join(".cursor"));
            #[cfg(target_os = "macos")]
            push_mac_app_support(&home, "Cursor", &mut dirs);
            #[cfg(target_os = "linux")]
            push_linux_config(&home, "cursor", &mut dirs);
            #[cfg(target_os = "windows")]
            push_windows_appdata("Cursor", &mut dirs);
        }

        dedupe_paths(dirs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_has_at_least_one_candidate() {
        let agent = CursorAgent::new();
        assert!(!agent.candidate_config_dirs().is_empty());
    }

    #[test]
    fn cursor_candidates_end_with_cursor_dir() {
        let agent = CursorAgent::new();
        let dirs = agent.candidate_config_dirs();
        assert!(dirs.iter().any(|dir| dir.ends_with(".cursor") || dir.ends_with("Cursor")));
    }
}
