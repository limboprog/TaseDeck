use std::process::{Child, Command};
use std::sync::{Mutex, OnceLock};

static CHILD_PIDS: OnceLock<Mutex<Vec<u32>>> = OnceLock::new();

fn child_pids() -> &'static Mutex<Vec<u32>> {
    CHILD_PIDS.get_or_init(|| Mutex::new(Vec::new()))
}

/// Linux: child receives SIGTERM when the parent process exits (including crashes).
#[cfg(target_os = "linux")]
pub fn apply_parent_death_signal(command: &mut Command) {
    use std::os::unix::process::CommandExt;

    unsafe {
        command.pre_exec(|| {
            libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
            Ok(())
        });
    }
}

#[cfg(not(target_os = "linux"))]
pub fn apply_parent_death_signal(_command: &mut Command) {}

pub fn register_child_pid(pid: u32) {
    if pid == 0 {
        return;
    }
    if let Ok(mut guard) = child_pids().lock() {
        guard.push(pid);
    }
}

pub fn unregister_child_pid(pid: u32) {
    if let Ok(mut guard) = child_pids().lock() {
        guard.retain(|value| *value != pid);
    }
}

pub fn kill_all_registered_children() {
    let pids: Vec<u32> = child_pids()
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default();
    for pid in pids {
        kill_pid(pid);
    }
    if let Ok(mut guard) = child_pids().lock() {
        guard.clear();
    }
}

fn kill_pid(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    {
        let _ = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
    }
    #[cfg(windows)]
    {
        use std::process::Command as OsCommand;
        let _ = OsCommand::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }
}

/// Wraps a spawned child; kills it on drop unless disarmed after a clean shutdown.
pub struct ChildGuard {
    child: Option<Child>,
}

impl ChildGuard {
    pub fn spawn(mut command: Command) -> Result<Self, String> {
        apply_parent_death_signal(&mut command);
        let child = command
            .spawn()
            .map_err(|error| format!("failed to spawn process: {error}"))?;
        register_child_pid(child.id());
        Ok(Self { child: Some(child) })
    }

    pub fn into_child(mut self) -> Child {
        self.disarm();
        self.child.take().expect("child missing")
    }

    pub fn disarm(&mut self) {
        if let Some(child) = self.child.as_ref() {
            unregister_child_pid(child.id());
        }
    }

    pub fn child_mut(&mut self) -> Option<&mut Child> {
        self.child.as_mut()
    }
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let pid = child.id();
            let _ = child.kill();
            let _ = child.wait();
            unregister_child_pid(pid);
        }
    }
}

pub fn stop_child(mut child: Child) {
    let pid = child.id();
    let _ = child.kill();
    let _ = child.wait();
    unregister_child_pid(pid);
}
