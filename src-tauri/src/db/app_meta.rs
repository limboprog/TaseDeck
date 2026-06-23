use super::Database;
use rusqlite::{params, OptionalExtension};

const BOOTSTRAP_COMPLETED_KEY: &str = "workspace_bootstrap_completed";
const BOOTSTRAP_VERSION_KEY: &str = "workspace_bootstrap_version";
pub const WORKSPACE_BOOTSTRAP_VERSION: &str = "2";

impl Database {
    pub fn get_app_meta(&self, key: &str) -> rusqlite::Result<Option<String>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare("SELECT value FROM app_meta WHERE key = ?1")?;
        stmt.query_row(params![key], |row| row.get(0))
            .optional()
    }

    pub fn set_app_meta(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "INSERT INTO app_meta (key, value, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at = datetime('now')",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn is_workspace_bootstrap_completed(&self) -> rusqlite::Result<bool> {
        let version_ok = self.get_app_meta(BOOTSTRAP_VERSION_KEY)?.as_deref()
            == Some(WORKSPACE_BOOTSTRAP_VERSION);
        let completed = self.get_app_meta(BOOTSTRAP_COMPLETED_KEY)?.as_deref() == Some("1");
        Ok(version_ok && completed)
    }

    pub fn mark_workspace_bootstrap_completed(&self) -> rusqlite::Result<()> {
        self.set_app_meta(BOOTSTRAP_COMPLETED_KEY, "1")?;
        self.set_app_meta(BOOTSTRAP_VERSION_KEY, WORKSPACE_BOOTSTRAP_VERSION)
    }
}

pub(crate) fn ensure_app_meta_table(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )
}
