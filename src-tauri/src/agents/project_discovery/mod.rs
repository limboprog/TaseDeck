mod paths;
mod vscode_like;

pub use paths::{folder_base_name, normalize_folder_path, pick_icon_color_for_path};
pub use vscode_like::discover_vscode_like_projects;

use std::path::PathBuf;

pub fn discover_projects_for_agent_kind(kind: &str) -> Vec<PathBuf> {
    if let Some(app_name) = vscode_like::vscode_like_app_support_name(kind) {
        return discover_vscode_like_projects(app_name);
    }

    match kind {
        "claude-code" => discover_claude_code_projects(),
        _ => Vec::new(),
    }
}

fn discover_claude_code_projects() -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let projects_dir = home.join(".claude").join("projects");
    let Ok(entries) = std::fs::read_dir(projects_dir) else {
        return Vec::new();
    };
    let mut paths = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(normalized) = normalize_folder_path(&path.display().to_string()) {
                paths.push(normalized);
            }
        }
    }

    paths
}
