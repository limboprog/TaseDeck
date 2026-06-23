use super::models::AgentRecord;
use super::Database;
use crate::agents::mcp_json::ensure_agent_mcp_json;
use crate::agents::resolve::{is_config_dir_valid, normalize_config_dir_path};
use rusqlite::{params, OptionalExtension};
use std::path::Path;

impl Database {
    pub fn list_agent_records(&self) -> rusqlite::Result<Vec<AgentRecord>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, kind, config_dir_path, created_at, updated_at
             FROM agents
             ORDER BY created_at DESC, id DESC",
        )?;
        let rows = stmt.query_map([], map_agent_row)?;
        rows.collect()
    }

    pub fn get_agent_record(&self, id: i64) -> rusqlite::Result<Option<AgentRecord>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        fetch_agent_record(&conn, id)
    }

    pub fn insert_agent_record(&self, agent: &AgentRecord) -> rusqlite::Result<AgentRecord> {
        if !agent.is_new() {
            return Err(super::invalid_input("id must be 0 when creating an agent"));
        }
        if agent.name.trim().is_empty() {
            return Err(super::invalid_input("name must not be empty"));
        }
        if agent.kind.trim().is_empty() {
            return Err(super::invalid_input("kind must not be empty"));
        }
        let config_dir_path = normalize_config_dir_path(&agent.config_dir_path)
            .map_err(|error| super::invalid_input(&error))?;
        std::fs::create_dir_all(&config_dir_path).map_err(|error| {
            super::invalid_input(&format!(
                "failed to create config directory: {error}"
            ))
        })?;
        if !is_config_dir_valid(&config_dir_path) {
            return Err(super::invalid_input(
                "config_dir_path does not exist or is not a directory",
            ));
        }
        ensure_agent_mcp_json(agent.kind.trim(), Path::new(&config_dir_path))
            .map_err(|error| super::invalid_input(&error))?;

        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "INSERT INTO agents (name, kind, config_dir_path) VALUES (?1, ?2, ?3)",
            params![agent.name.trim(), agent.kind.trim(), config_dir_path],
        )?;
        let id = conn.last_insert_rowid();
        fetch_agent_record(&conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn update_agent_record(&self, agent: &AgentRecord) -> rusqlite::Result<AgentRecord> {
        if agent.id <= 0 {
            return Err(super::invalid_input("id is required for update"));
        }

        let existing = self
            .get_agent_record(agent.id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        let name = super::non_empty_or(agent.name.trim(), &existing.name);
        let kind = super::non_empty_or(agent.kind.trim(), &existing.kind);
        let raw_path = super::non_empty_or(agent.config_dir_path.trim(), &existing.config_dir_path);
        let config_dir_path = normalize_config_dir_path(&raw_path)
            .map_err(|error| super::invalid_input(&error))?;
        std::fs::create_dir_all(&config_dir_path).map_err(|error| {
            super::invalid_input(&format!(
                "failed to create config directory: {error}"
            ))
        })?;
        if !is_config_dir_valid(&config_dir_path) {
            return Err(super::invalid_input(
                "config_dir_path does not exist or is not a directory",
            ));
        }
        ensure_agent_mcp_json(kind.trim(), Path::new(&config_dir_path))
            .map_err(|error| super::invalid_input(&error))?;

        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "UPDATE agents
             SET name = ?1, kind = ?2, config_dir_path = ?3, updated_at = datetime('now')
             WHERE id = ?4",
            params![name, kind, config_dir_path, agent.id],
        )?;

        fetch_agent_record(&conn, agent.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn delete_agent_record(&self, id: i64) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let affected = conn.execute("DELETE FROM agents WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }
}

fn fetch_agent_record(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<Option<AgentRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, kind, config_dir_path, created_at, updated_at
         FROM agents WHERE id = ?1",
    )?;
    stmt.query_row(params![id], map_agent_row).optional()
}

pub(crate) fn map_agent_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentRecord> {
    Ok(AgentRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: row.get(2)?,
        config_dir_path: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}
