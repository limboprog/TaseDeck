use super::models::{GraphLinkInput, GraphRecord, GraphServerLink, GraphState};
use super::Database;
use rusqlite::{params, OptionalExtension};

impl Database {
    pub fn get_graph_state_by_client_id(
        &self,
        client_id: &str,
        name: &str,
    ) -> rusqlite::Result<GraphState> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let graph = get_or_create_graph(&conn, client_id, name)?;
        let links = list_graph_links(&conn, graph.id)?;
        Ok(GraphState { graph, links })
    }

    pub fn replace_graph_links(
        &self,
        client_id: &str,
        name: &str,
        links: &[GraphLinkInput],
    ) -> rusqlite::Result<GraphState> {
        let conn = self.conn.lock().expect("database mutex poisoned");

        let graph = get_or_create_graph(&conn, client_id, name)?;

        conn.execute(
            "DELETE FROM graph_server_links WHERE graph_id = ?1",
            params![graph.id],
        )?;

        for link in links {
            if link.agent_id <= 0 || link.mcp_server_id <= 0 {
                return Err(super::invalid_input(
                    "agent_id and mcp_server_id must be positive",
                ));
            }

            conn.execute(
                "INSERT INTO graph_server_links (graph_id, agent_id, mcp_server_id, active, edge_enabled)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    graph.id,
                    link.agent_id,
                    link.mcp_server_id,
                    bool_to_sql(link.active),
                    bool_to_sql(link.edge_enabled),
                ],
            )?;
        }

        conn.execute(
            "UPDATE graphs SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![name.trim(), graph.id],
        )?;

        let links = list_graph_links(&conn, graph.id)?;
        let graph = fetch_graph_record(&conn, graph.id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        Ok(GraphState { graph, links })
    }

    pub fn delete_graph_by_client_id(&self, client_id: &str) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let affected = conn.execute("DELETE FROM graphs WHERE client_id = ?1", params![client_id])?;
        Ok(affected > 0)
    }
}

fn get_or_create_graph(conn: &rusqlite::Connection, client_id: &str, name: &str) -> rusqlite::Result<GraphRecord> {
    if let Some(graph) = fetch_graph_by_client_id(conn, client_id)? {
        return Ok(graph);
    }

    conn.execute(
        "INSERT INTO graphs (client_id, name) VALUES (?1, ?2)",
        params![client_id.trim(), name.trim()],
    )?;
    let id = conn.last_insert_rowid();
    fetch_graph_record(conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

fn fetch_graph_by_client_id(
    conn: &rusqlite::Connection,
    client_id: &str,
) -> rusqlite::Result<Option<GraphRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, name, created_at, updated_at
         FROM graphs WHERE client_id = ?1",
    )?;
    stmt.query_row(params![client_id], map_graph_row).optional()
}

fn fetch_graph_record(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<Option<GraphRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, name, created_at, updated_at
         FROM graphs WHERE id = ?1",
    )?;
    stmt.query_row(params![id], map_graph_row).optional()
}

fn list_graph_links(conn: &rusqlite::Connection, graph_id: i64) -> rusqlite::Result<Vec<GraphServerLink>> {
    let mut stmt = conn.prepare(
        "SELECT id, graph_id, agent_id, mcp_server_id, active, edge_enabled, created_at, updated_at
         FROM graph_server_links
         WHERE graph_id = ?1
         ORDER BY id ASC",
    )?;
    let rows = stmt.query_map(params![graph_id], map_graph_link_row)?;
    rows.collect()
}

fn map_graph_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GraphRecord> {
    Ok(GraphRecord {
        id: row.get(0)?,
        client_id: row.get(1)?,
        name: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn map_graph_link_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GraphServerLink> {
    Ok(GraphServerLink {
        id: row.get(0)?,
        graph_id: row.get(1)?,
        agent_id: row.get(2)?,
        mcp_server_id: row.get(3)?,
        active: sql_to_bool(row.get(4)?),
        edge_enabled: sql_to_bool(row.get(5)?),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn bool_to_sql(value: bool) -> i64 {
    if value { 1 } else { 0 }
}

fn sql_to_bool(value: i64) -> bool {
    value != 0
}
