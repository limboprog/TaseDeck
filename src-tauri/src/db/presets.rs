use super::models::{McpServer, McpServerType, PresetRecord};
use super::Database;
use crate::agents::mcp_json::{mcp_entry_key_for_server, uniquify_mcp_entry_key};
use crate::agents::project_mcp::extract_config_overrides;
use rusqlite::{params, OptionalExtension};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashSet};

pub(crate) fn ensure_presets_tables(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            server_fingerprint TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_presets_name ON presets (name);
        CREATE TABLE IF NOT EXISTS preset_mcp_servers (
            preset_id INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
            mcp_server_id INTEGER NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
            server_key TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (preset_id, server_key)
        );
        CREATE TABLE IF NOT EXISTS project_preset_assignments (
            project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
            preset_id INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
            config_overrides TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS agent_project_preset_assignments (
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            preset_id INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
            config_overrides TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (project_id, agent_id)
        );
        CREATE TABLE IF NOT EXISTS agent_project_custom_preset_cache (
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            preset_id INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
            config_overrides TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (project_id, agent_id)
        );",
    )?;

    migrate_project_preset_assignments(conn)?;

    Ok(())
}

fn migrate_project_preset_assignments(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    let has_default_source: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('project_preset_assignments') WHERE name = 'default_source_mcp_json'",
        [],
        |row| row.get(0),
    )?;
    if has_default_source == 0 {
        conn.execute(
            "ALTER TABLE project_preset_assignments ADD COLUMN default_source_mcp_json TEXT",
            [],
        )?;
    }
    Ok(())
}

fn is_user_saved_preset_fingerprint(fingerprint: &str) -> bool {
    fingerprint.starts_with("manual-")
}

impl Database {
    pub fn list_preset_records(&self) -> rusqlite::Result<Vec<PresetRecord>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, server_fingerprint, created_at, updated_at
             FROM presets
             ORDER BY updated_at DESC, id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?;

        let mut presets = Vec::new();
        for row in rows {
            let (id, name, fingerprint, created_at, updated_at) = row?;
            if !is_user_saved_preset_fingerprint(&fingerprint) {
                continue;
            }
            let mcp_server_ids = list_preset_mcp_server_ids_conn(&conn, id)?;
            presets.push(PresetRecord {
                id,
                name,
                server_fingerprint: fingerprint,
                mcp_server_ids,
                created_at,
                updated_at,
            });
        }
        Ok(presets)
    }

    fn list_preset_mcp_server_ids(&self, preset_id: i64) -> rusqlite::Result<Vec<i64>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        list_preset_mcp_server_ids_conn(&conn, preset_id)
    }

    pub fn find_preset_by_fingerprint(
        &self,
        fingerprint: &str,
    ) -> rusqlite::Result<Option<PresetRecord>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, server_fingerprint, created_at, updated_at
             FROM presets WHERE server_fingerprint = ?1",
        )?;
        let record = stmt
            .query_row(params![fingerprint], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .optional()?;

        let Some((id, name, server_fingerprint, created_at, updated_at)) = record else {
            return Ok(None);
        };

        Ok(Some(PresetRecord {
            id,
            name,
            server_fingerprint,
            mcp_server_ids: list_preset_mcp_server_ids_conn(&conn, id)?,
            created_at,
            updated_at,
        }))
    }

    pub fn upsert_preset_record(
        &self,
        name: &str,
        fingerprint: &str,
        server_links: &BTreeMap<String, i64>,
    ) -> rusqlite::Result<PresetRecord> {
        let existing_id = {
            let conn = self.conn.lock().expect("database mutex poisoned");
            let mut stmt = conn.prepare(
                "SELECT id FROM presets WHERE server_fingerprint = ?1 LIMIT 1",
            )?;
            stmt.query_row(params![fingerprint], |row| row.get(0))
                .optional()?
        };

        if let Some(id) = existing_id {
            self.replace_preset_mcp_servers(id, server_links)?;
            return self.get_preset_record(id)?.ok_or(rusqlite::Error::QueryReturnedNoRows);
        }

        let id = {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute(
                "INSERT INTO presets (name, server_fingerprint) VALUES (?1, ?2)",
                params![name.trim(), fingerprint],
            )?;
            conn.last_insert_rowid()
        };
        self.replace_preset_mcp_servers(id, server_links)?;
        self.get_preset_record(id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    fn replace_preset_mcp_servers(
        &self,
        preset_id: i64,
        server_links: &BTreeMap<String, i64>,
    ) -> rusqlite::Result<()> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "DELETE FROM preset_mcp_servers WHERE preset_id = ?1",
            params![preset_id],
        )?;
        for (server_key, mcp_server_id) in server_links {
            conn.execute(
                "INSERT INTO preset_mcp_servers (preset_id, mcp_server_id, server_key)
                 VALUES (?1, ?2, ?3)",
                params![preset_id, mcp_server_id, server_key],
            )?;
        }
        Ok(())
    }

    pub fn set_preset_server_ids(
        &self,
        preset_id: i64,
        server_ids: &[i64],
    ) -> rusqlite::Result<()> {
        let links = build_preset_server_links(self, server_ids)?;
        self.replace_preset_mcp_servers(preset_id, &links)
    }

    pub fn get_preset_record(&self, id: i64) -> rusqlite::Result<Option<PresetRecord>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, server_fingerprint, created_at, updated_at
             FROM presets WHERE id = ?1",
        )?;
        let record = stmt
            .query_row(params![id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .optional()?;

        let Some((id, name, server_fingerprint, created_at, updated_at)) = record else {
            return Ok(None);
        };

        Ok(Some(PresetRecord {
            id,
            name,
            server_fingerprint,
            mcp_server_ids: list_preset_mcp_server_ids_conn(&conn, id)?,
            created_at,
            updated_at,
        }))
    }

    pub fn insert_preset_record(&self, name: &str) -> rusqlite::Result<PresetRecord> {
        let fingerprint = format!(
            "manual-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or(0)
        );
        self.upsert_preset_record(name, &fingerprint, &BTreeMap::new())
    }

    pub fn update_preset_record(
        &self,
        id: i64,
        name: Option<&str>,
        mcp_server_ids: Option<&[i64]>,
    ) -> rusqlite::Result<PresetRecord> {
        let existing = self
            .get_preset_record(id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        if let Some(next_name) = name {
            let usages = self.list_project_agent_assignments_for_preset(id)?;
            if usages.len() > 1 {
                return Err(super::invalid_input(
                    "cannot rename a preset that is used by multiple project assignments",
                ));
            }
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute(
                "UPDATE presets SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![next_name.trim(), id],
            )?;
        }

        if let Some(server_ids) = mcp_server_ids {
            let links = build_preset_server_links(self, server_ids)?;
            self.replace_preset_mcp_servers(id, &links)?;
        }

        self.get_preset_record(id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn delete_preset_record(&self, id: i64) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let affected = conn.execute("DELETE FROM presets WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    pub fn upsert_project_preset_assignment(
        &self,
        project_id: i64,
        preset_id: i64,
        config_overrides: &Value,
    ) -> rusqlite::Result<()> {
        let payload = serde_json::to_string(config_overrides)
            .map_err(|error| super::invalid_input(&error.to_string()))?;
        {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute(
                "INSERT INTO project_preset_assignments (project_id, preset_id, config_overrides)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(project_id) DO UPDATE SET
                   preset_id = excluded.preset_id,
                   config_overrides = excluded.config_overrides,
                   updated_at = datetime('now')",
                params![project_id, preset_id, payload],
            )?;
        }
        Ok(())
    }

    pub fn get_project_default_source_mcp_json(
        &self,
        project_id: i64,
    ) -> rusqlite::Result<Option<String>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let value: Option<String> = conn
            .query_row(
                "SELECT default_source_mcp_json
                 FROM project_preset_assignments
                 WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        Ok(value
            .map(|entry| entry.trim().to_string())
            .filter(|entry| !entry.is_empty()))
    }

    pub fn set_project_default_source_mcp_json_if_empty(
        &self,
        project_id: i64,
        source_json: &str,
    ) -> rusqlite::Result<bool> {
        let trimmed = source_json.trim();
        if trimmed.is_empty() {
            return Ok(false);
        }
        let conn = self.conn.lock().expect("database mutex poisoned");
        let affected = conn.execute(
            "UPDATE project_preset_assignments
             SET default_source_mcp_json = ?1, updated_at = datetime('now')
             WHERE project_id = ?2
               AND (default_source_mcp_json IS NULL OR trim(default_source_mcp_json) = '')",
            params![trimmed, project_id],
        )?;
        Ok(affected > 0)
    }

    pub fn upsert_project_preset_assignment_with_agents(
        &self,
        project_id: i64,
        preset_id: i64,
        config_overrides: &Value,
    ) -> rusqlite::Result<()> {
        self.upsert_project_preset_assignment(project_id, preset_id, config_overrides)?;
        let agents = self.list_project_agents(project_id)?;
        for agent in agents {
            self.upsert_agent_project_preset_assignment(
                project_id,
                agent.id,
                preset_id,
                config_overrides,
            )?;
        }
        Ok(())
    }

    pub fn ensure_mcp_server_from_entry(
        &self,
        name: &str,
        entry: &Value,
    ) -> rusqlite::Result<McpServer> {
        let normalized_name = name.trim();
        if normalized_name.is_empty() {
            return Err(super::invalid_input("server name must not be empty"));
        }

        let existing = self.find_mcp_server_by_name(normalized_name)?;

        if let Some(mut server) = existing {
            let obj = entry
                .as_object()
                .ok_or_else(|| super::invalid_input("server entry must be an object"))?;
            let updated_json = serde_json::to_string(entry).unwrap_or_else(|_| "{}".to_string());
            let url = obj
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            let command = obj
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            let args: Vec<String> = obj
                .get("args")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|value| value.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let run_command = if !url.is_empty() {
                url.to_string()
            } else {
                std::iter::once(command.to_string())
                    .chain(args)
                    .filter(|part| !part.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ")
            };
            server.json_config = updated_json;
            if !run_command.is_empty() {
                server.run_command = run_command;
            }
            return self.update_mcp_server(&server);
        }

        let obj = entry
            .as_object()
            .ok_or_else(|| super::invalid_input("server entry must be an object"))?;

        let url = obj
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let is_remote = !url.is_empty();
        let command = obj
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let args: Vec<String> = obj
            .get("args")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|value| value.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        let run_command = if is_remote {
            url.clone()
        } else {
            std::iter::once(command)
                .chain(args)
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        };

        let server = McpServer {
            id: 0,
            name: normalized_name.to_string(),
            server_type: if is_remote {
                McpServerType::Remote
            } else {
                McpServerType::Local
            },
            path: None,
            run_command,
            json_config: serde_json::to_string(entry).unwrap_or_else(|_| "{}".to_string()),
            config_inputs: "[]".to_string(),
            config_values: "{}".to_string(),
            description: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        };

        self.insert_mcp_server(&server)
    }

    pub fn build_assignment_overrides(servers: &BTreeMap<String, Value>) -> Value {
        let mut overrides = Map::new();
        for (name, entry) in servers {
            let patch = extract_config_overrides(entry);
            if patch.as_object().is_some_and(|map| !map.is_empty()) {
                overrides.insert(name.clone(), patch);
            }
        }
        Value::Object(overrides)
    }
}

fn build_preset_server_links(
    db: &Database,
    server_ids: &[i64],
) -> rusqlite::Result<BTreeMap<String, i64>> {
    let mut links = BTreeMap::new();
    let mut used = HashSet::new();
    for server_id in server_ids {
        let server = db
            .get_mcp_server(*server_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        let base = mcp_entry_key_for_server(&server);
        let key = uniquify_mcp_entry_key(&base, &mut used);
        links.insert(key, *server_id);
    }
    Ok(links)
}

fn list_preset_mcp_server_ids_conn(
    conn: &rusqlite::Connection,
    preset_id: i64,
) -> rusqlite::Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT mcp_server_id FROM preset_mcp_servers
         WHERE preset_id = ?1
         ORDER BY server_key ASC",
    )?;
    let rows = stmt.query_map(params![preset_id], |row| row.get(0))?;
    rows.collect()
}
