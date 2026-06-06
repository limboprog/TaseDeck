use super::Database;
use rusqlite::{params, OptionalExtension};

impl Database {
    pub fn set_topology_focused_server(
        &self,
        graph_id: i64,
        server_id: i64,
    ) -> rusqlite::Result<()> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "INSERT INTO topology_run_state (graph_id, focused_mcp_server_id, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(graph_id) DO UPDATE SET
               focused_mcp_server_id = excluded.focused_mcp_server_id,
               updated_at = datetime('now')",
            params![graph_id, server_id],
        )?;
        Ok(())
    }

    pub fn get_topology_focused_server(&self, graph_id: i64) -> rusqlite::Result<Option<i64>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.query_row(
            "SELECT focused_mcp_server_id FROM topology_run_state WHERE graph_id = ?1",
            params![graph_id],
            |row| row.get(0),
        )
        .optional()
    }

    pub fn clear_topology_run_state(&self, graph_id: i64) -> rusqlite::Result<()> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "DELETE FROM topology_run_state WHERE graph_id = ?1",
            params![graph_id],
        )?;
        Ok(())
    }
}
