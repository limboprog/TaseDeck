use crate::core::env::{apply_process_env, shell_command_builder};
use std::process::Stdio;

pub fn run_shell(command: &str) -> std::io::Result<std::process::Output> {
    let mut child = shell_command_builder();
    apply_process_env(&mut child);
    child
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
