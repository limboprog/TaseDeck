use std::ffi::OsStr;
use std::process::Command;

/// Spawn helper: no console window on Windows (avoids cmd/node/where flashes).
#[cfg(windows)]
pub fn hidden_command(program: impl AsRef<OsStr>) -> Command {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(not(windows))]
pub fn hidden_command(program: impl AsRef<OsStr>) -> Command {
    Command::new(program)
}

/// On Windows, child processes inherit a visible console unless CREATE_NO_WINDOW is set.
#[cfg(windows)]
pub fn hide_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console_window(_command: &mut Command) {}
