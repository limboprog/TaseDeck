use crate::db::{Database, UsageLogEntry};
use serde_json::Value;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub const TASEDECK_MCP_NAME: &str = "TaseDeck MCP";

const MAX_ENTRIES: usize = 500;

pub struct UsageLogStore {
    entries: Mutex<VecDeque<UsageLogEntry>>,
    next_id: AtomicU64,
    app_handle: Mutex<Option<tauri::AppHandle>>,
}

impl UsageLogStore {
    pub fn new(db: &Database) -> Self {
        let (entries, next_id) = db
            .load_usage_log()
            .unwrap_or_else(|error| {
                eprintln!("failed to load usage log: {error}");
                (VecDeque::new(), 1)
            });

        Self {
            entries: Mutex::new(entries),
            next_id: AtomicU64::new(next_id),
            app_handle: Mutex::new(None),
        }
    }

    pub fn attach_app(&self, handle: tauri::AppHandle) {
        if let Ok(mut guard) = self.app_handle.lock() {
            *guard = Some(handle);
        }
    }

    pub fn list(&self, limit: Option<usize>) -> Vec<UsageLogEntry> {
        let limit = limit.unwrap_or(MAX_ENTRIES).min(MAX_ENTRIES);
        let Ok(entries) = self.entries.lock() else {
            return Vec::new();
        };
        entries.iter().rev().take(limit).cloned().collect()
    }

    pub fn record_success(&self, mcp_name: impl Into<String>, tool_name: impl Into<String>, value: &Value) {
        self.push(mcp_name, tool_name, true, format_result(value));
    }

    pub fn record_error(
        &self,
        mcp_name: impl Into<String>,
        tool_name: impl Into<String>,
        message: impl AsRef<str>,
    ) {
        self.push(mcp_name, tool_name, false, message.as_ref().to_string());
    }

    fn push(
        &self,
        mcp_name: impl Into<String>,
        tool_name: impl Into<String>,
        success: bool,
        result: String,
    ) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let entry = UsageLogEntry {
            id,
            mcp_name: mcp_name.into(),
            tool_name: tool_name.into(),
            success,
            result,
            created_at: chrono_lite_now(),
        };

        if let Ok(guard) = self.app_handle.lock() {
            if let Some(app) = guard.as_ref() {
                if let Some(db) = app.try_state::<Database>() {
                    if let Err(error) = db.insert_usage_log_entry(&entry) {
                        eprintln!("failed to persist usage log entry: {error}");
                    }
                }
            }
        }

        if let Ok(mut entries) = self.entries.lock() {
            entries.push_back(entry);
            while entries.len() > MAX_ENTRIES {
                entries.pop_front();
            }
        }

        self.notify();
    }

    fn notify(&self) {
        let Ok(guard) = self.app_handle.lock() else {
            return;
        };
        if let Some(app) = guard.as_ref() {
            let _ = app.emit("usage-log-updated", ());
        }
    }
}

fn format_result(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}", duration.as_secs(), duration.subsec_millis())
}
