use crate::agents::resolve::expand_home_path;
use std::path::{Path, PathBuf};

const PROJECT_ICON_COLORS: &[&str] = &["#FF5F56", "#FFBD2E", "#27C93F", "#007AFF", "#98989D"];

pub fn normalize_folder_path(path: &str) -> Option<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }

    let expanded = expand_home_path(trimmed);
    let canonical = expanded.canonicalize().unwrap_or(expanded);
    Some(canonical)
}

pub fn folder_base_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.display().to_string())
}

pub fn pick_icon_color_for_path(path: &str) -> String {
    let hash = path
        .bytes()
        .fold(0u32, |acc, byte| acc.wrapping_mul(31).wrapping_add(u32::from(byte)));
    let index = hash as usize % PROJECT_ICON_COLORS.len();
    PROJECT_ICON_COLORS[index].to_string()
}

pub fn decode_file_uri(uri: &str) -> Option<PathBuf> {
    let trimmed = uri.trim();
    if !trimmed.starts_with("file://") {
        return None;
    }

    let path_part = trimmed.strip_prefix("file://")?;
    if path_part.is_empty() {
        return None;
    }

    let decoded = urlencoding::decode(path_part).ok()?.into_owned();
    let path = if decoded.starts_with('/') {
        PathBuf::from(decoded)
    } else {
        PathBuf::from(format!("/{decoded}"))
    };

    normalize_folder_path(&path.display().to_string())
}

pub fn is_valid_project_directory(path: &Path, home: Option<&Path>) -> bool {
    if !path.is_dir() {
        return false;
    }

    if let Some(home_path) = home {
        if path == home_path {
            return false;
        }
    }

    let invalid_roots = [Path::new("/"), Path::new("/Users"), Path::new("/home")];
    if invalid_roots.iter().any(|root| path == *root) {
        return false;
    }

    folder_base_name(path) != "/"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_file_uri() {
        let path = decode_file_uri("file:///Users/me/project").expect("path");
        assert!(path.ends_with("project"));
    }

    #[test]
    fn folder_base_name_uses_last_segment() {
        assert_eq!(
            folder_base_name(Path::new("/Users/me/TaseDeck")),
            "TaseDeck"
        );
    }
}
