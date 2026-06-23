#[cfg(target_os = "windows")]
use crate::core::process::hide_console_window;
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
pub fn run_shell(command: &str) -> std::io::Result<std::process::Output> {
    let mut child = Command::new("cmd");
    hide_console_window(&mut child);
    child
        .args(["/C", command])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
}

#[cfg(not(target_os = "windows"))]
pub fn run_shell(command: &str) -> std::io::Result<std::process::Output> {
    Command::new("sh")
        .arg("-c")
        .arg(command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
}

pub fn run_shell_checked(command: &str) -> Result<(), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("install command is empty".to_string());
    }

    let output = run_shell(trimmed).map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let details = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("exit code {}", output.status)
    };

    Err(format!("install failed: {details}"))
}
