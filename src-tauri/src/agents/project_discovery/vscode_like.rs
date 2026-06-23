use super::paths::{decode_file_uri, is_valid_project_directory, normalize_folder_path};
use dirs::home_dir;
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

pub fn discover_vscode_like_projects(app_support_name: &str) -> Vec<PathBuf> {
    let mut paths = BTreeSet::new();
    let home = home_dir();

    if let Some(user_data) = vscode_user_data_dir(app_support_name) {
        collect_workspace_storage_paths(&user_data, &mut paths);
        collect_recent_paths_from_state_db(&user_data, &mut paths);
    }

    paths
        .into_iter()
        .filter(|path| is_valid_project_directory(path, home.as_deref()))
        .collect()
}

fn vscode_user_data_dir(app_support_name: &str) -> Option<PathBuf> {
    let home = home_dir()?;

    #[cfg(target_os = "macos")]
    {
        let path = home
            .join("Library")
            .join("Application Support")
            .join(app_support_name)
            .join("User");
        return path.is_dir().then_some(path);
    }

    #[cfg(target_os = "linux")]
    {
        let candidates = [
            home.join(".config").join(app_support_name).join("User"),
            home.join(".config").join(app_support_name),
        ];
        return candidates.into_iter().find(|path| path.is_dir());
    }

    #[cfg(target_os = "windows")]
    {
        let app_data = std::env::var_os("APPDATA")?;
        let path = PathBuf::from(app_data)
            .join(app_support_name)
            .join("User");
        return path.is_dir().then_some(path);
    }

    #[allow(unreachable_code)]
    None
}

fn collect_workspace_storage_paths(user_data_dir: &Path, paths: &mut BTreeSet<PathBuf>) {
    let storage_root = user_data_dir.join("workspaceStorage");
    let entries = match fs::read_dir(storage_root) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let workspace_json = entry.path().join("workspace.json");
        let Ok(raw) = fs::read_to_string(workspace_json) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        if let Some(folder_uri) = value.get("folder").and_then(Value::as_str) {
            if let Some(path) = decode_file_uri(folder_uri) {
                paths.insert(path);
            }
        }
        if let Some(workspace_uri) = value.get("workspace").and_then(Value::as_str) {
            if let Some(path) = workspace_parent_from_workspace_uri(workspace_uri) {
                paths.insert(path);
            }
        }
    }
}

fn workspace_parent_from_workspace_uri(uri: &str) -> Option<PathBuf> {
    let path = decode_file_uri(uri)?;
    if path.extension().and_then(|ext| ext.to_str()) == Some("code-workspace") {
        return path.parent().map(Path::to_path_buf).and_then(|parent| {
            normalize_folder_path(&parent.display().to_string())
        });
    }
    Some(path)
}

fn collect_recent_paths_from_state_db(user_data_dir: &Path, paths: &mut BTreeSet<PathBuf>) {
    let db_path = user_data_dir.join("globalStorage").join("state.vscdb");
    if !db_path.is_file() {
        return;
    }

    let conn = match rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(conn) => conn,
        Err(_) => return,
    };

    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'",
            [],
            |row| row.get(0),
        )
        .ok();

    let Some(raw) = value else {
        return;
    };

    let Ok(json) = serde_json::from_str::<Value>(&raw) else {
        return;
    };

    let Some(entries) = json.get("entries").and_then(Value::as_array) else {
        return;
    };

    for entry in entries {
        let folder_uri = entry
            .get("folderUri")
            .or_else(|| entry.get("workspaceUri"))
            .and_then(Value::as_str);
        let Some(uri) = folder_uri else {
            continue;
        };
        if let Some(path) = decode_file_uri(uri) {
            paths.insert(path);
        } else if let Some(path) = workspace_parent_from_workspace_uri(uri) {
            paths.insert(path);
        }
    }
}

pub fn vscode_like_app_support_name(kind: &str) -> Option<&'static str> {
    match kind {
        "cursor" => Some("Cursor"),
        "vscode" => Some("Code"),
        "windsurf" => Some("Windsurf"),
        _ => None,
    }
}
