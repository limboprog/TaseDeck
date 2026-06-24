use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

const MAX_RENAME_ATTEMPTS: u32 = 5;
const INITIAL_RETRY_DELAY_MS: u64 = 12;

static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Writes `contents` to `path` atomically: temp file in the same directory, then rename.
/// Rename is retried with short backoff (file locks on Windows / concurrent agent access).
pub fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("missing parent directory for {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let temp_path = temp_path_for(parent, path);
    write_temp_file(&temp_path, contents)?;

    match rename_with_retries(&temp_path, path) {
        Ok(()) => {
            sync_parent_dir(parent);
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            Err(error)
        }
    }
}

fn temp_path_for(parent: &Path, target: &Path) -> PathBuf {
    let file_name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "config".to_string());
    let pid = std::process::id();
    let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
    parent.join(format!(".{file_name}.{pid}.{seq}.tmp"))
}

fn write_temp_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)
        .map_err(|error| format!("failed to create temp file {}: {error}", path.display()))?;
    file.write_all(contents)
        .map_err(|error| format!("failed to write temp file {}: {error}", path.display()))?;
    file.sync_all()
        .map_err(|error| format!("failed to sync temp file {}: {error}", path.display()))?;
    Ok(())
}

fn sync_parent_dir(parent: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        if let Ok(dir) = OpenOptions::new().read(true).custom_flags(libc::O_DIRECTORY).open(parent)
        {
            let _ = dir.sync_all();
        }
    }
}

fn rename_with_retries(from: &Path, to: &Path) -> Result<(), String> {
    let mut last_error = String::from("rename failed");

    for attempt in 0..MAX_RENAME_ATTEMPTS {
        match try_rename(from, to) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error;
                if attempt + 1 < MAX_RENAME_ATTEMPTS {
                    let delay = INITIAL_RETRY_DELAY_MS * u64::from(attempt + 1);
                    thread::sleep(Duration::from_millis(delay));
                }
            }
        }
    }

    Err(last_error)
}

fn try_rename(from: &Path, to: &Path) -> Result<(), String> {
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(first_error) => {
            #[cfg(not(windows))]
            {
                return Err(format!(
                    "failed to rename {} -> {}: {first_error}",
                    from.display(),
                    to.display()
                ));
            }
            #[cfg(windows)]
            {
                if let Ok(()) = try_rename_windows_movefileex(from, to) {
                    return Ok(());
                }
                return try_rename_windows_backup(from, to);
            }
        }
    }
}

#[cfg(windows)]
fn try_rename_windows_movefileex(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    fn to_wide(path: &Path) -> Vec<u16> {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let from_w = to_wide(from);
    let to_w = to_wide(to);
    let flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;
    let ok = unsafe { MoveFileExW(from_w.as_ptr(), to_w.as_ptr(), flags) };
    if ok != 0 {
        return Ok(());
    }
    let code = unsafe { GetLastError() };
    Err(format!("MoveFileExW failed: error code {code}"))
}

#[cfg(windows)]
fn try_rename_windows_backup(from: &Path, to: &Path) -> Result<(), String> {
    let backup = to.with_extension("tasedeck.bak");
    let had_target = to.exists();

    if backup.exists() && !had_target {
        let _ = fs::remove_file(&backup);
    }

    if had_target {
        if backup.exists() {
            let _ = fs::remove_file(&backup);
        }
        fs::rename(to, &backup).map_err(|error| {
            format!(
                "failed to backup {} -> {}: {error}",
                to.display(),
                backup.display()
            )
        })?;
    }

    match fs::rename(from, to) {
        Ok(()) => {
            if had_target {
                let _ = fs::remove_file(&backup);
            }
            Ok(())
        }
        Err(rename_error) => {
            if had_target {
                if to.exists() {
                    let _ = fs::remove_file(to);
                }
                let _ = fs::rename(&backup, to);
            }
            Err(format!(
                "failed to rename {} -> {} (restored backup): {rename_error}",
                from.display(),
                to.display()
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn atomic_write_replaces_existing_file() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("tasedeck-atomic-{stamp}"));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("mcp.json");

        atomic_write(&path, b"{\"a\":1}\n").expect("first write");
        atomic_write(&path, b"{\"b\":2}\n").expect("second write");

        let payload = fs::read_to_string(&path).expect("read");
        assert_eq!(payload, "{\"b\":2}\n");

        let _ = fs::remove_dir_all(dir);
    }
}
