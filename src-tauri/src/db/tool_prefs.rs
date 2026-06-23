use rusqlite::{params, Connection};
use std::collections::HashMap;

pub fn ensure_tool_prefs_table(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mcp_server_tool_prefs (
            server_id INTEGER NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
            tool_name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (server_id, tool_name)
        );
        CREATE INDEX IF NOT EXISTS idx_mcp_tool_prefs_server ON mcp_server_tool_prefs (server_id);",
    )
}

pub fn load_tool_prefs_map(
    conn: &Connection,
    server_id: i64,
) -> rusqlite::Result<HashMap<String, bool>> {
    let mut stmt = conn.prepare(
        "SELECT tool_name, enabled FROM mcp_server_tool_prefs WHERE server_id = ?1",
    )?;
    let rows = stmt.query_map(params![server_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0))
    })?;

    let mut map = HashMap::new();
    for row in rows {
        let (name, enabled) = row?;
        map.insert(name, enabled);
    }
    Ok(map)
}

pub fn set_tool_pref(
    conn: &Connection,
    server_id: i64,
    tool_name: &str,
    enabled: bool,
) -> rusqlite::Result<()> {
    let tool_name = tool_name.trim();
    if tool_name.is_empty() {
        return Ok(());
    }
    if enabled {
        // Default is enabled — store only explicit opt-outs (enabled = 0).
        conn.execute(
            "DELETE FROM mcp_server_tool_prefs WHERE server_id = ?1 AND tool_name = ?2",
            params![server_id, tool_name],
        )?;
        return Ok(());
    }
    conn.execute(
        "INSERT INTO mcp_server_tool_prefs (server_id, tool_name, enabled, updated_at)
         VALUES (?1, ?2, 0, datetime('now'))
         ON CONFLICT(server_id, tool_name) DO UPDATE SET
           enabled = 0,
           updated_at = datetime('now')",
        params![server_id, tool_name],
    )?;
    Ok(())
}

pub fn replace_tool_prefs(
    conn: &Connection,
    server_id: i64,
    prefs: &HashMap<String, bool>,
) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM mcp_server_tool_prefs WHERE server_id = ?1",
        params![server_id],
    )?;
    for (tool_name, enabled) in prefs {
        if !*enabled {
            set_tool_pref(conn, server_id, tool_name, false)?;
        }
    }
    Ok(())
}

pub fn clear_tool_prefs(conn: &Connection, server_id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM mcp_server_tool_prefs WHERE server_id = ?1",
        params![server_id],
    )?;
    Ok(())
}

/// Removes legacy rows that stored `enabled = 1`. Prefs are a deny-list only.
pub fn normalize_tool_prefs(conn: &Connection, server_id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM mcp_server_tool_prefs WHERE server_id = ?1 AND enabled = 1",
        params![server_id],
    )?;
    Ok(())
}

pub fn disabled_tool_prefs(map: HashMap<String, bool>) -> HashMap<String, bool> {
    map.into_iter()
        .filter(|(_, enabled)| !*enabled)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch("PRAGMA foreign_keys = OFF;")
            .expect("pragma");
        ensure_tool_prefs_table(&conn).expect("schema");
        conn
    }

    #[test]
    fn enabling_tool_removes_pref_row() {
        let conn = test_conn();
        set_tool_pref(&conn, 1, "deploy_app", false).expect("disable");
        set_tool_pref(&conn, 1, "deploy_app", true).expect("re-enable");
        let map = load_tool_prefs_map(&conn, 1).expect("load");
        assert!(map.is_empty());
    }

    #[test]
    fn disabled_tool_prefs_keeps_only_false_entries() {
        let mut map = HashMap::from([
            ("get_app_status".to_string(), true),
            ("deploy_app".to_string(), false),
        ]);
        map = disabled_tool_prefs(map);
        assert_eq!(map.get("deploy_app"), Some(&false));
        assert!(!map.contains_key("get_app_status"));
    }
}
