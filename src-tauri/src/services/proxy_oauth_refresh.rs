use crate::core::fs::oauth_runtime_dir;
use crate::services::{sync_oauth_runtime_token, OAuthStore};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

pub struct ProxyOAuthRefresher {
    oauth: Arc<OAuthStore>,
    running: AtomicBool,
}

impl ProxyOAuthRefresher {
    pub fn new(oauth: Arc<OAuthStore>) -> Self {
        Self {
            oauth,
            running: AtomicBool::new(false),
        }
    }

    pub fn start_background(self: &Arc<Self>) {
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }

        let refresher = Arc::clone(self);
        thread::spawn(move || {
            while refresher.running.load(Ordering::Relaxed) {
                if let Err(error) = refresher.poll_once() {
                    eprintln!("proxy oauth refresh failed: {error}");
                }
                thread::sleep(Duration::from_secs(2));
            }
        });
    }

    pub fn poll_once(&self) -> Result<usize, String> {
        let root = oauth_runtime_dir();
        if !root.is_dir() {
            return Ok(0);
        }

        let mut refreshed = 0usize;
        let entries = fs::read_dir(&root).map_err(|error| error.to_string())?;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(server_id) = parse_refresh_request_server_id(&path) else {
                continue;
            };

            let server = self
                .oauth
                .database()
                .get_mcp_server(server_id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| format!("MCP server {server_id} not found for oauth refresh"))?;

            sync_oauth_runtime_token(&self.oauth, &server)?;
            let _ = fs::remove_file(&path);
            refreshed += 1;
        }

        Ok(refreshed)
    }
}

fn parse_refresh_request_server_id(path: &PathBuf) -> Option<i64> {
    let name = path.file_name()?.to_str()?;
    let stem = name.strip_suffix(".refresh")?;
    stem.parse::<i64>().ok().filter(|id| *id > 0)
}
