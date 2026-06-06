mod agent_records;
mod graphs;
pub mod mcp_config;
mod models;
mod topology_run;

pub use models::{
    AgentRecord, GraphLinkInput, GraphRecord, GraphServerLink, GraphState, InstallMcpLocalRequest,
    McpServer, McpServerType,
};

use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(error))
            })?;
        }

        let conn = Connection::open(path)?;
        conn.execute_batch(include_str!("init.sql"))?;
        migrate(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn list_mcp_servers(&self) -> rusqlite::Result<Vec<McpServer>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, server_type, path, run_command, json_config, config_inputs, config_values, description, created_at, updated_at
             FROM mcp_servers
             ORDER BY created_at DESC, id DESC",
        )?;

        let rows = stmt.query_map([], map_mcp_server_row)?;
        rows.collect()
    }

    pub fn get_mcp_server(&self, id: i64) -> rusqlite::Result<Option<McpServer>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        fetch_mcp_server(&conn, id)
    }

    pub fn insert_mcp_server(&self, server: &McpServer) -> rusqlite::Result<McpServer> {
        validate_new(server)?;

        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "INSERT INTO mcp_servers (name, server_type, path, run_command, json_config, config_inputs, config_values, description)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                server.name.trim(),
                server.server_type.as_str(),
                normalized_path(server.server_type, server.path.as_deref()),
                server.run_command.trim(),
                server.json_config.trim(),
                server.config_inputs.trim(),
                server.config_values.trim(),
                server.description.trim(),
            ],
        )?;

        let id = conn.last_insert_rowid();
        fetch_mcp_server(&conn, id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn update_mcp_server(&self, server: &McpServer) -> rusqlite::Result<McpServer> {
        if server.id <= 0 {
            return Err(invalid_input("id is required for update"));
        }

        let existing = self
            .get_mcp_server(server.id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        let next_type = server.server_type;
        let next_name = non_empty_or(server.name.trim(), &existing.name);
        let next_run_command = non_empty_or(server.run_command.trim(), &existing.run_command);
        let next_json_config = non_empty_or(server.json_config.trim(), &existing.json_config);
        let next_config_inputs =
            non_empty_or(server.config_inputs.trim(), &existing.config_inputs);
        let next_config_values =
            non_empty_or(server.config_values.trim(), &existing.config_values);
        let next_description = non_empty_or(server.description.trim(), &existing.description);
        let next_path = match server.path.as_deref() {
            Some(value) => normalized_path(next_type, Some(value)),
            None if next_type == McpServerType::Remote => None,
            None => existing.path,
        };

        validate_fields(next_type, next_path.as_deref(), next_run_command.as_str())?;

        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "UPDATE mcp_servers
             SET name = ?1,
                 server_type = ?2,
                 path = ?3,
                 run_command = ?4,
                 json_config = ?5,
                 config_inputs = ?6,
                 config_values = ?7,
                 description = ?8,
                 updated_at = datetime('now')
             WHERE id = ?9",
            params![
                next_name,
                next_type.as_str(),
                next_path,
                next_run_command,
                next_json_config,
                next_config_inputs,
                next_config_values,
                next_description,
                server.id,
            ],
        )?;

        fetch_mcp_server(&conn, server.id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn delete_mcp_server(&self, id: i64) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let affected = conn.execute("DELETE FROM mcp_servers WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }
}

fn fetch_mcp_server(conn: &Connection, id: i64) -> rusqlite::Result<Option<McpServer>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, server_type, path, run_command, json_config, config_inputs, config_values, description, created_at, updated_at
         FROM mcp_servers
         WHERE id = ?1",
    )?;

    stmt.query_row(params![id], map_mcp_server_row).optional()
}

fn map_mcp_server_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<McpServer> {
    let server_type_raw: String = row.get(2)?;
    let server_type = McpServerType::from_str(&server_type_raw).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            2,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("unknown server_type: {server_type_raw}"),
            )),
        )
    })?;

    Ok(McpServer {
        id: row.get(0)?,
        name: row.get(1)?,
        server_type,
        path: row.get(3)?,
        run_command: row.get(4)?,
        json_config: row.get(5)?,
        config_inputs: row.get(6)?,
        config_values: row.get(7)?,
        description: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let has_description: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('mcp_servers') WHERE name = 'description'",
        [],
        |row| row.get(0),
    )?;

    if has_description == 0 {
        conn.execute(
            "ALTER TABLE mcp_servers ADD COLUMN description TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }

    let has_config_inputs: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('mcp_servers') WHERE name = 'config_inputs'",
        [],
        |row| row.get(0),
    )?;
    if has_config_inputs == 0 {
        conn.execute(
            "ALTER TABLE mcp_servers ADD COLUMN config_inputs TEXT NOT NULL DEFAULT '[]'",
            [],
        )?;
    }

    let has_config_values: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('mcp_servers') WHERE name = 'config_values'",
        [],
        |row| row.get(0),
    )?;
    if has_config_values == 0 {
        conn.execute(
            "ALTER TABLE mcp_servers ADD COLUMN config_values TEXT NOT NULL DEFAULT '{}'",
            [],
        )?;
    }

    let has_agent_kind: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('agents') WHERE name = 'kind'",
        [],
        |row| row.get(0),
    )?;
    if has_agent_kind == 0 {
        conn.execute(
            "ALTER TABLE agents ADD COLUMN kind TEXT NOT NULL DEFAULT 'cursor'",
            [],
        )?;
    }

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS topology_run_state (
            graph_id INTEGER PRIMARY KEY REFERENCES graphs(id) ON DELETE CASCADE,
            focused_mcp_server_id INTEGER REFERENCES mcp_servers(id) ON DELETE SET NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    Ok(())
}

fn validate_new(server: &McpServer) -> rusqlite::Result<()> {
    if !server.is_new() {
        return Err(invalid_input("id must be 0 when creating a server"));
    }

    if server.name.trim().is_empty() {
        return Err(invalid_input("name must not be empty"));
    }

    validate_fields(
        server.server_type,
        server.path.as_deref(),
        server.run_command.as_str(),
    )
}

pub(crate) fn non_empty_or(value: &str, fallback: &str) -> String {
    if value.is_empty() {
        fallback.to_string()
    } else {
        value.to_string()
    }
}

fn validate_fields(
    server_type: McpServerType,
    path: Option<&str>,
    run_command: &str,
) -> rusqlite::Result<()> {
    match server_type {
        McpServerType::Local => {
            let has_path = path.map(str::trim).filter(|value| !value.is_empty()).is_some();
            let has_run = !run_command.trim().is_empty();
            if !has_path && !has_run {
                return Err(invalid_input(
                    "path or run_command is required for local MCP servers",
                ));
            }
        }
        McpServerType::Remote => {}
    }

    Ok(())
}

fn normalized_path(server_type: McpServerType, path: Option<&str>) -> Option<String> {
    match server_type {
        McpServerType::Local => path.map(str::trim).filter(|value| !value.is_empty()).map(str::to_string),
        McpServerType::Remote => None,
    }
}

pub(crate) fn invalid_input(message: &str) -> rusqlite::Error {
    rusqlite::Error::InvalidParameterName(message.to_string())
}
