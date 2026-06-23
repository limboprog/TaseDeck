use super::models::UsageLogEntry;
use rusqlite::{params, Connection};
use std::collections::VecDeque;

const MAX_ENTRIES: usize = 500;
pub const MAX_STORED_RESULT_CHARS: usize = 4_096;

pub fn truncate_usage_result(result: &str) -> String {
    if result.chars().count() <= MAX_STORED_RESULT_CHARS {
        return result.to_string();
    }
    let truncated: String = result.chars().take(MAX_STORED_RESULT_CHARS).collect();
    format!("{truncated}\n…[truncated]")
}

pub fn ensure_usage_log_table(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS usage_log_entries (
            id INTEGER PRIMARY KEY,
            mcp_name TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            caller TEXT,
            success INTEGER NOT NULL CHECK (success IN (0, 1)),
            result TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log_entries (created_at DESC);",
    )?;

    let has_caller: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('usage_log_entries') WHERE name = 'caller'",
        [],
        |row| row.get(0),
    )?;
    let has_agent_name: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('usage_log_entries') WHERE name = 'agent_name'",
        [],
        |row| row.get(0),
    )?;

    if has_caller == 0 && has_agent_name != 0 {
        conn.execute(
            "ALTER TABLE usage_log_entries RENAME COLUMN agent_name TO caller",
            [],
        )?;
    } else if has_caller == 0 {
        conn.execute(
            "ALTER TABLE usage_log_entries ADD COLUMN caller TEXT",
            [],
        )?;
    }

    let has_project_id: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('usage_log_entries') WHERE name = 'project_id'",
        [],
        |row| row.get(0),
    )?;
    if has_project_id == 0 {
        conn.execute(
            "ALTER TABLE usage_log_entries ADD COLUMN project_id INTEGER",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_usage_log_project ON usage_log_entries (project_id, created_at DESC)",
            [],
        )?;
    }

    Ok(())
}

pub fn load_usage_log_entries(conn: &Connection) -> rusqlite::Result<(VecDeque<UsageLogEntry>, u64)> {
    let mut stmt = conn.prepare(
        "SELECT id, mcp_name, tool_name, caller, success, result, created_at, project_id
         FROM usage_log_entries
         ORDER BY id ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        let caller: Option<String> = row.get(3)?;
        let project_id: Option<i64> = row.get(7)?;
        Ok(UsageLogEntry {
            id: row.get::<_, i64>(0)? as u64,
            mcp_name: row.get(1)?,
            tool_name: row.get(2)?,
            caller: caller.unwrap_or_else(|| "user".to_string()),
            success: row.get::<_, i64>(4)? != 0,
            result: row.get(5)?,
            created_at: row.get(6)?,
            project_id: project_id.filter(|id| *id > 0),
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
    let result = truncate_usage_result(&entry.result);
    conn.execute(
        "INSERT INTO usage_log_entries (id, mcp_name, tool_name, caller, success, result, created_at, project_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            entry.id as i64,
            entry.mcp_name,
            entry.tool_name,
            entry.caller,
            if entry.success { 1 } else { 0 },
            result,
            entry.created_at,
            entry.project_id,
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

pub fn usage_log_entry_exists(
    conn: &Connection,
    mcp_name: &str,
    tool_name: &str,
    caller: &str,
    created_at: &str,
    project_id: Option<i64>,
) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM usage_log_entries
         WHERE mcp_name = ?1 AND tool_name = ?2 AND caller = ?3 AND created_at = ?4
           AND COALESCE(project_id, 0) = COALESCE(?5, 0)",
        params![mcp_name, tool_name, caller, created_at, project_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}
