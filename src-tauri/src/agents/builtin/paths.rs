use std::path::PathBuf;

pub fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut unique = Vec::new();
    for path in paths {
        if unique.iter().any(|existing| existing == &path) {
            continue;
        }
        unique.push(path);
    }
    unique
}

pub fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

pub fn push_mac_app_support(home: &PathBuf, app_name: &str, dirs: &mut Vec<PathBuf>) {
    dirs.push(
        home.join("Library")
            .join("Application Support")
            .join(app_name),
    );
}

pub fn push_linux_config(home: &PathBuf, app_name: &str, dirs: &mut Vec<PathBuf>) {
    dirs.push(home.join(".config").join(app_name));
}

pub fn push_windows_appdata(app_folder: &str, dirs: &mut Vec<PathBuf>) {
    if let Some(app_data) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(app_data).join(app_folder));
    }
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        dirs.push(PathBuf::from(local_app_data).join(app_folder));
    }
}
