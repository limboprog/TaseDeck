use crate::db::{Database, UsageLogEntry};
use serde_json::Value;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

pub const TASEDECK_MCP_NAME: &str = "TaseDeck MCP";

const MAX_ENTRIES: usize = 500;

pub struct UsageLogStore {
    db: Arc<Database>,
    entries: Mutex<VecDeque<UsageLogEntry>>,
    next_id: AtomicU64,
    app_handle: Mutex<Option<tauri::AppHandle>>,
}

impl UsageLogStore {
    pub fn new(db: Arc<Database>) -> Self {
        let (entries, next_id) = db
            .load_usage_log()
            .unwrap_or_else(|error| {
                eprintln!("failed to load usage log: {error}");
                let next_id = db
                    .max_usage_log_id()
                    .map(|id| id.saturating_add(1))
                    .unwrap_or(1);
                (VecDeque::new(), next_id)
            });

        Self {
            db,
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

        if let Ok((entries, next_id)) = self.db.load_usage_log() {
            self.next_id.store(next_id, Ordering::Relaxed);
            if let Ok(mut guard) = self.entries.lock() {
                *guard = entries;
            }
        }

        let Ok(guard) = self.entries.lock() else {
            return Vec::new();
        };

        guard
            .iter()
            .rev()
            .filter(|entry| is_user_visible_tool_call(entry))
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn record_tool_call_success(
        &self,
        mcp_name: impl Into<String>,
        tool_name: impl Into<String>,
        caller: impl Into<String>,
        value: &Value,
    ) {
        self.push(mcp_name, tool_name, caller, true, format_result(value));
    }

    pub fn record_tool_call_error(
        &self,
        mcp_name: impl Into<String>,
        tool_name: impl Into<String>,
        caller: impl Into<String>,
        message: impl AsRef<str>,
    ) {
        self.push(
            mcp_name,
            tool_name,
            caller,
            false,
            message.as_ref().to_string(),
        );
    }

    fn push(
        &self,
        mcp_name: impl Into<String>,
        tool_name: impl Into<String>,
        caller: impl Into<String>,
        success: bool,
        result: String,
    ) {
        let mut entry = UsageLogEntry {
            id: self.next_id.fetch_add(1, Ordering::Relaxed),
            mcp_name: mcp_name.into(),
            tool_name: tool_name.into(),
            caller: caller.into(),
            success,
            result,
            created_at: chrono_lite_now(),
            project_id: None,
        };

        if !is_user_visible_tool_call(&entry) {
            return;
        }

        if let Err(error) = self.db.insert_usage_log_entry(&entry) {
            eprintln!("failed to persist usage log entry: {error}");
            if let Ok(next_id) = self.db.max_usage_log_id().map(|id| id.saturating_add(1)) {
                entry.id = next_id;
                self.next_id.store(next_id.saturating_add(1), Ordering::Relaxed);
                if let Err(retry_error) = self.db.insert_usage_log_entry(&entry) {
                    eprintln!("failed to persist usage log entry after id retry: {retry_error}");
                    return;
                }
            } else {
                return;
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

    /// Ingest a log line written by proxy.mjs. Returns true when a new row was stored.
    pub fn ingest_external_entry(&self, mut entry: UsageLogEntry) -> Result<bool, String> {
        if !is_user_visible_tool_call(&entry) {
            return Ok(false);
        }

        if self
            .db
            .usage_log_entry_exists(
                &entry.mcp_name,
                &entry.tool_name,
                &entry.caller,
                &entry.created_at,
                entry.project_id,
            )
            .map_err(|error| error.to_string())?
        {
            return Ok(false);
        }

        entry.id = self.next_id.fetch_add(1, Ordering::Relaxed);
        if let Err(error) = self.db.insert_usage_log_entry(&entry) {
            if let Ok(next_id) = self.db.max_usage_log_id().map(|id| id.saturating_add(1)) {
                entry.id = next_id;
                self.next_id.store(next_id.saturating_add(1), Ordering::Relaxed);
                self.db
                    .insert_usage_log_entry(&entry)
                    .map_err(|error| error.to_string())?;
            } else {
                return Err(error.to_string());
            }
        }

        if let Ok(mut entries) = self.entries.lock() {
            entries.push_back(entry);
            while entries.len() > MAX_ENTRIES {
                entries.pop_front();
            }
        }

        self.notify();
        Ok(true)
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

pub fn is_user_visible_tool_call(entry: &UsageLogEntry) -> bool {
    if entry.mcp_name == TASEDECK_MCP_NAME {
        return false;
    }

    let tool = entry.tool_name.trim();
    if tool.is_empty() {
        return false;
    }

    if entry.caller == "user" {
        return !matches!(tool, "list_servers" | "tools" | "call_tool");
    }

    !matches!(
        tool,
        "initialize" | "tools/list" | "list" | "list_servers" | "tools" | "call_tool"
    )
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
