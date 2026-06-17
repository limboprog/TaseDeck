use super::models::UsageLogEntry;
use rusqlite::{params, Connection};
use std::collections::VecDeque;

const MAX_ENTRIES: usize = 500;

pub fn ensure_usage_log_table(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS usage_log_entries (
            id INTEGER PRIMARY KEY,
            mcp_name TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            success INTEGER NOT NULL CHECK (success IN (0, 1)),
            result TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log_entries (created_at DESC);",
    )
}

pub fn load_usage_log_entries(conn: &Connection) -> rusqlite::Result<(VecDeque<UsageLogEntry>, u64)> {
    let mut stmt = conn.prepare(
        "SELECT id, mcp_name, tool_name, success, result, created_at
         FROM usage_log_entries
         ORDER BY id ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(UsageLogEntry {
            id: row.get::<_, i64>(0)? as u64,
            mcp_name: row.get(1)?,
            tool_name: row.get(2)?,
            success: row.get::<_, i64>(3)? != 0,
            result: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;

    let mut entries = VecDeque::new();
    let mut next_id = 1_u64;

    for row in rows {
        let entry = row?;
        next_id = entry.id.saturating_add(1);
        entries.push_back(entry);
        while entries.len() > MAX_ENTRIES {
            entries.pop_front();
        }
    }

    Ok((entries, next_id))
}

pub fn insert_usage_log_entry(conn: &Connection, entry: &UsageLogEntry) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO usage_log_entries (id, mcp_name, tool_name, success, result, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            entry.id as i64,
            entry.mcp_name,
            entry.tool_name,
            if entry.success { 1 } else { 0 },
            entry.result,
            entry.created_at,
        ],
    )?;

    conn.execute(
        "DELETE FROM usage_log_entries
         WHERE id NOT IN (
             SELECT id FROM usage_log_entries ORDER BY id DESC LIMIT ?1
         )",
        params![MAX_ENTRIES],
    )?;

    Ok(())
}
