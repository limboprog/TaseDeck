use super::models::{
    AgentRecord, ProjectAgentAssignmentDetail, ProjectAssignmentDetail, ProjectDetailRecord,
    ProjectPresetServerDetail, ProjectRecord,
};
use super::{agent_records, Database};
use crate::agents::project_discovery::{folder_base_name, normalize_folder_path, pick_icon_color_for_path};
use rusqlite::{params, OptionalExtension};
use serde_json::json;
use std::collections::BTreeMap;

pub(crate) fn ensure_projects_tables(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            icon_color TEXT NOT NULL DEFAULT '#007AFF',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_projects_name ON projects (name);
        CREATE TABLE IF NOT EXISTS agent_projects (
            agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (agent_id, project_id)
        );
        CREATE INDEX IF NOT EXISTS idx_agent_projects_project ON agent_projects (project_id);",
    )
}

impl Database {
    pub fn list_project_records(&self) -> rusqlite::Result<Vec<ProjectRecord>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, folder_path, name, icon_color, created_at, updated_at
             FROM projects
             ORDER BY updated_at DESC, id DESC",
        )?;
        let rows = stmt.query_map([], map_project_row)?;
        rows.collect()
    }

    pub fn get_project_record(&self, id: i64) -> rusqlite::Result<Option<ProjectRecord>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        fetch_project_record(&conn, id)
    }

    pub fn find_project_by_folder_path(&self, folder_path: &str) -> rusqlite::Result<Option<ProjectRecord>> {
        let Some(normalized) = normalize_folder_path(folder_path) else {
            return Ok(None);
        };
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, folder_path, name, icon_color, created_at, updated_at
             FROM projects WHERE folder_path = ?1",
        )?;
        stmt.query_row(
            params![normalized.display().to_string()],
            map_project_row,
        )
        .optional()
    }

    pub fn upsert_project_record(
        &self,
        folder_path: &str,
        name: Option<&str>,
        icon_color: Option<&str>,
    ) -> rusqlite::Result<ProjectRecord> {
        let Some(normalized) = normalize_folder_path(folder_path) else {
            return Err(super::invalid_input("folder_path is invalid"));
        };
        if !normalized.is_dir() {
            return Err(super::invalid_input("folder_path does not exist or is not a directory"));
        }

        let folder_path_string = normalized.display().to_string();
        let resolved_name = name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| folder_base_name(normalized.as_path()));
        let resolved_icon_color = icon_color
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| pick_icon_color_for_path(&folder_path_string));

        if let Some(existing) = self.find_project_by_folder_path(&folder_path_string)? {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute(
                "UPDATE projects
                 SET name = ?1,
                     icon_color = COALESCE(?2, icon_color),
                     updated_at = datetime('now')
                 WHERE id = ?3",
                params![resolved_name, resolved_icon_color, existing.id],
            )?;
            return fetch_project_record(&conn, existing.id)?
                .ok_or(rusqlite::Error::QueryReturnedNoRows);
        }

        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "INSERT INTO projects (folder_path, name, icon_color)
             VALUES (?1, ?2, ?3)",
            params![folder_path_string, resolved_name, resolved_icon_color],
        )?;
        let id = conn.last_insert_rowid();
        fetch_project_record(&conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn insert_project_record(
        &self,
        folder_path: &str,
        name: &str,
        icon_color: Option<&str>,
    ) -> rusqlite::Result<ProjectRecord> {
        self.upsert_project_record(folder_path, Some(name), icon_color)
    }

    pub fn delete_project_record(&self, id: i64) -> rusqlite::Result<bool> {
        let disk_cleanup = if let Ok(Some(project)) = self.get_project_record(id) {
            normalize_folder_path(project.folder_path.trim()).map(|root| {
                let agents = self.list_project_agents(id).unwrap_or_default();
                (root, agents)
            })
        } else {
            None
        };

        let affected = {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?
        };

        if affected > 0 {
            self.purge_orphaned_presets_after_project_delete(id)?;
        }

        if let Some((root, agents)) = disk_cleanup {
            for agent in &agents {
                let _ = crate::agents::project_proxy_export::cleanup_tasedeck_project_agent_artifacts(
                    &root,
                    &agent.kind,
                );
            }
        }

        Ok(affected > 0)
    }

    fn purge_orphaned_presets_after_project_delete(&self, project_id: i64) -> rusqlite::Result<()> {
        let like_pattern = format!("project-{project_id}-%");
        let ids = {
            let conn = self.conn.lock().expect("database mutex poisoned");
            let mut stmt =
                conn.prepare("SELECT id FROM presets WHERE server_fingerprint LIKE ?1")?;
            let rows = stmt.query_map(params![like_pattern], |row| row.get::<_, i64>(0))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        for preset_id in ids {
            if self.preset_has_no_assignments(preset_id)? {
                let _ = self.delete_preset_record(preset_id)?;
            }
        }
        Ok(())
    }

    fn preset_has_no_assignments(&self, preset_id: i64) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let agent_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM agent_project_preset_assignments WHERE preset_id = ?1",
            params![preset_id],
            |row| row.get(0),
        )?;
        let project_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM project_preset_assignments WHERE preset_id = ?1",
            params![preset_id],
            |row| row.get(0),
        )?;
        Ok(agent_count == 0 && project_count == 0)
    }

    pub fn list_project_agents(&self, project_id: i64) -> rusqlite::Result<Vec<AgentRecord>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT a.id, a.name, a.kind, a.config_dir_path, a.created_at, a.updated_at
             FROM agents a
             INNER JOIN agent_projects ap ON ap.agent_id = a.id
             WHERE ap.project_id = ?1
             ORDER BY ap.created_at ASC, ap.agent_id ASC",
        )?;
        let rows = stmt.query_map(params![project_id], agent_records::map_agent_row)?;
        rows.collect()
    }

    pub fn list_projects_for_agent(&self, agent_id: i64) -> rusqlite::Result<Vec<ProjectRecord>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT p.id, p.folder_path, p.name, p.icon_color, p.created_at, p.updated_at
             FROM projects p
             INNER JOIN agent_projects ap ON ap.project_id = p.id
             WHERE ap.agent_id = ?1
             ORDER BY ap.created_at ASC, ap.project_id ASC",
        )?;
        let rows = stmt.query_map(params![agent_id], map_project_row)?;
        rows.collect()
    }

    pub fn list_project_agent_assignments_for_preset(
        &self,
        preset_id: i64,
    ) -> rusqlite::Result<Vec<(i64, i64)>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT project_id, agent_id
             FROM agent_project_preset_assignments
             WHERE preset_id = ?1",
        )?;
        let rows = stmt.query_map(params![preset_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?;
        rows.collect()
    }

    /// Delete preset when it has at most one assignment. Returns `(deleted, in_use, unassigned_pairs)`.
    pub fn try_delete_preset_if_unused(
        &self,
        preset_id: i64,
    ) -> rusqlite::Result<(bool, bool, Vec<(i64, i64)>)> {
        let usages = self.list_project_agent_assignments_for_preset(preset_id)?;
        if usages.len() > 1 {
            return Ok((false, true, Vec::new()));
        }

        let mut unassigned = Vec::new();
        for (project_id, agent_id) in usages {
            if self.unassign_agent_project_preset(project_id, agent_id)? {
                unassigned.push((project_id, agent_id));
            }
        }

        let deleted = self.delete_preset_record(preset_id)?;
        Ok((deleted, false, unassigned))
    }

    pub fn list_project_agent_assignments_for_server(
        &self,
        server_id: i64,
    ) -> rusqlite::Result<Vec<(i64, i64)>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT appa.project_id, appa.agent_id
             FROM agent_project_preset_assignments appa
             INNER JOIN preset_mcp_servers pms ON pms.preset_id = appa.preset_id
             WHERE pms.mcp_server_id = ?1",
        )?;
        let rows = stmt.query_map(params![server_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?;
        rows.collect()
    }

    pub fn get_project_detail(&self, id: i64) -> rusqlite::Result<Option<ProjectDetailRecord>> {
        let project = match self.get_project_record(id)? {
            Some(record) => record,
            None => return Ok(None),
        };
        let agents = self.list_project_agents(id)?;
        let agent_assignments = agents
            .iter()
            .map(|agent| {
                Ok(ProjectAgentAssignmentDetail {
                    agent_id: agent.id,
                    assignment: self.get_agent_project_assignment_detail(id, agent.id)?,
                    has_custom_preset: self.agent_has_custom_preset_record(id, agent.id)?,
                })
            })
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(Some(ProjectDetailRecord {
            project,
            agents,
            default_assignment: self.get_project_assignment_detail(id)?,
            agent_assignments,
            native_mcp_imported: false,
            default_source_mcp_json: self.get_project_default_source_mcp_json(id)?,
        }))
    }

    pub fn get_agent_project_assignment_detail(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<Option<ProjectAssignmentDetail>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let row = conn
            .query_row(
                "SELECT preset_id, config_overrides
                 FROM agent_project_preset_assignments
                 WHERE project_id = ?1 AND agent_id = ?2",
                params![project_id, agent_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;

        let Some((preset_id, config_overrides)) = row else {
            return Ok(None);
        };

        build_project_assignment_detail(&conn, preset_id, config_overrides)
    }

    pub fn agent_uses_project_default_preset(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<bool> {
        let Some(default) = self.get_project_assignment_detail(project_id)? else {
            return Ok(false);
        };
        let Some(agent) = self.get_agent_project_assignment_detail(project_id, agent_id)? else {
            return Ok(false);
        };
        Ok(agent.preset_id == default.preset_id)
    }

    fn agent_custom_preset_fingerprint(project_id: i64, agent_id: i64) -> String {
        format!("project-{project_id}-agent-{agent_id}")
    }

    fn agent_custom_preset_display_name(project_name: &str, agent_name: &str) -> String {
        format!("{}-{}", project_name.trim(), agent_name.trim())
    }

    fn ensure_agent_custom_preset_record(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<i64> {
        let fingerprint = Self::agent_custom_preset_fingerprint(project_id, agent_id);
        if let Some(custom) = self.find_preset_by_fingerprint(&fingerprint)? {
            return Ok(custom.id);
        }

        let project = self
            .get_project_record(project_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        let agent = self
            .get_agent_record(agent_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        let preset_name = Self::agent_custom_preset_display_name(&project.name, &agent.name);

        let mut server_links = BTreeMap::new();
        let mut overrides = json!({});
        if let Some(default) = self.get_project_assignment_detail(project_id)? {
            for entry in &default.servers {
                let key = entry.server_key.trim();
                if !key.is_empty() {
                    server_links.insert(key.to_string(), entry.server.id);
                }
            }
            overrides =
                serde_json::from_str(&default.config_overrides).unwrap_or_else(|_| json!({}));
        }

        let preset = self.upsert_preset_record(&preset_name, &fingerprint, &server_links)?;
        self.upsert_agent_custom_preset_cache(project_id, agent_id, preset.id, &overrides)?;
        Ok(preset.id)
    }

    pub fn agent_has_custom_preset_record(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<bool> {
        let fingerprint = Self::agent_custom_preset_fingerprint(project_id, agent_id);
        Ok(self
            .find_preset_by_fingerprint(&fingerprint)?
            .is_some())
    }

    fn upsert_agent_custom_preset_cache(
        &self,
        project_id: i64,
        agent_id: i64,
        preset_id: i64,
        config_overrides: &serde_json::Value,
    ) -> rusqlite::Result<()> {
        let payload = serde_json::to_string(config_overrides)
            .map_err(|error| super::invalid_input(&error.to_string()))?;
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "INSERT INTO agent_project_custom_preset_cache (project_id, agent_id, preset_id, config_overrides)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(project_id, agent_id) DO UPDATE SET
               preset_id = excluded.preset_id,
               config_overrides = excluded.config_overrides,
               updated_at = datetime('now')",
            params![project_id, agent_id, preset_id, payload],
        )?;
        Ok(())
    }

    fn get_agent_custom_preset_cache(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<Option<(i64, serde_json::Value)>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let row = conn
            .query_row(
                "SELECT preset_id, config_overrides
                 FROM agent_project_custom_preset_cache
                 WHERE project_id = ?1 AND agent_id = ?2",
                params![project_id, agent_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let Some((preset_id, config_overrides)) = row else {
            return Ok(None);
        };
        let overrides =
            serde_json::from_str(&config_overrides).unwrap_or_else(|_| json!({}));
        Ok(Some((preset_id, overrides)))
    }

    pub fn apply_default_preset_to_agent(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<Option<ProjectAssignmentDetail>> {
        let default = self
            .get_project_assignment_detail(project_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        if let Some(assignment) = self.get_agent_project_assignment_detail(project_id, agent_id)? {
            let fingerprint = Self::agent_custom_preset_fingerprint(project_id, agent_id);
            if let Some(custom) = self.find_preset_by_fingerprint(&fingerprint)? {
                if assignment.preset_id == custom.id {
                    let overrides: serde_json::Value =
                        serde_json::from_str(&assignment.config_overrides)
                            .unwrap_or_else(|_| json!({}));
                    self.upsert_agent_custom_preset_cache(
                        project_id,
                        agent_id,
                        custom.id,
                        &overrides,
                    )?;
                }
            }
        }

        let overrides: serde_json::Value =
            serde_json::from_str(&default.config_overrides).unwrap_or_else(|_| json!({}));
        self.link_agent_project(agent_id, project_id)?;
        self.upsert_agent_project_preset_assignment(
            project_id,
            agent_id,
            default.preset_id,
            &overrides,
        )?;
        self.get_agent_project_assignment_detail(project_id, agent_id)
    }

    pub fn apply_custom_preset_to_agent(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<Option<ProjectAssignmentDetail>> {
        let custom_preset_id = self.ensure_agent_custom_preset_record(project_id, agent_id)?;

        let overrides = self
            .get_agent_custom_preset_cache(project_id, agent_id)?
            .map(|(_, value)| value)
            .unwrap_or_else(|| json!({}));

        self.link_agent_project(agent_id, project_id)?;
        self.upsert_agent_project_preset_assignment(
            project_id,
            agent_id,
            custom_preset_id,
            &overrides,
        )?;
        self.get_agent_project_assignment_detail(project_id, agent_id)
    }

    pub fn delete_agent_custom_preset(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<Option<ProjectAssignmentDetail>> {
        let fingerprint = Self::agent_custom_preset_fingerprint(project_id, agent_id);

        {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute(
                "DELETE FROM agent_project_custom_preset_cache
                 WHERE project_id = ?1 AND agent_id = ?2",
                params![project_id, agent_id],
            )?;
        }

        if let Some(custom) = self.find_preset_by_fingerprint(&fingerprint)? {
            if let Some(assignment) = self.get_agent_project_assignment_detail(project_id, agent_id)? {
                if assignment.preset_id == custom.id {
                    self.unassign_agent_project_preset(project_id, agent_id)?;
                }
            }
            let _ = self.delete_preset_record(custom.id)?;
        }

        self.apply_default_preset_to_agent(project_id, agent_id)
    }

    pub fn purge_agent_custom_preset_records(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<()> {
        {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute(
                "DELETE FROM agent_project_custom_preset_cache
                 WHERE project_id = ?1 AND agent_id = ?2",
                params![project_id, agent_id],
            )?;
        }

        let fingerprint = Self::agent_custom_preset_fingerprint(project_id, agent_id);
        if let Some(custom) = self.find_preset_by_fingerprint(&fingerprint)? {
            let _ = self.delete_preset_record(custom.id)?;
        }
        Ok(())
    }

    pub fn get_project_assignment_detail(
        &self,
        project_id: i64,
    ) -> rusqlite::Result<Option<ProjectAssignmentDetail>> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let row = conn
            .query_row(
                "SELECT preset_id, config_overrides
                 FROM project_preset_assignments
                 WHERE project_id = ?1",
                params![project_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;

        let Some((preset_id, config_overrides)) = row else {
            return Ok(None);
        };

        build_project_assignment_detail(&conn, preset_id, config_overrides)
    }

    pub fn update_agent_project_assignment_overrides(
        &self,
        project_id: i64,
        agent_id: i64,
        config_overrides: &str,
    ) -> rusqlite::Result<bool> {
        let affected = {
            let conn = self.conn.lock().expect("database mutex poisoned");
            conn.execute(
                "UPDATE agent_project_preset_assignments
                 SET config_overrides = ?1, updated_at = datetime('now')
                 WHERE project_id = ?2 AND agent_id = ?3",
                params![config_overrides, project_id, agent_id],
            )?
        };

        if affected > 0 {
            let fingerprint = Self::agent_custom_preset_fingerprint(project_id, agent_id);
            if let Some(custom) = self.find_preset_by_fingerprint(&fingerprint)? {
                if let Some(assignment) =
                    self.get_agent_project_assignment_detail(project_id, agent_id)?
                {
                    if assignment.preset_id == custom.id {
                        let overrides: serde_json::Value =
                            serde_json::from_str(config_overrides).unwrap_or_else(|_| json!({}));
                        self.upsert_agent_custom_preset_cache(
                            project_id,
                            agent_id,
                            custom.id,
                            &overrides,
                        )?;
                    }
                }
            }
        }

        Ok(affected > 0)
    }

    pub fn update_project_assignment_overrides(
        &self,
        project_id: i64,
        config_overrides: &str,
    ) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let affected = conn.execute(
            "UPDATE project_preset_assignments
             SET config_overrides = ?1, updated_at = datetime('now')
             WHERE project_id = ?2",
            params![config_overrides, project_id],
        )?;
        Ok(affected > 0)
    }

    pub fn assign_agent_project_preset(
        &self,
        project_id: i64,
        agent_id: i64,
        preset_id: i64,
    ) -> rusqlite::Result<Option<ProjectAssignmentDetail>> {
        self.link_agent_project(agent_id, project_id)?;
        self.upsert_agent_project_preset_assignment(project_id, agent_id, preset_id, &json!({}))?;
        self.get_agent_project_assignment_detail(project_id, agent_id)
    }

    pub fn unassign_agent_project_preset(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let affected = conn.execute(
            "DELETE FROM agent_project_preset_assignments
             WHERE project_id = ?1 AND agent_id = ?2",
            params![project_id, agent_id],
        )?;
        Ok(affected > 0)
    }

    pub fn assign_project_preset(
        &self,
        project_id: i64,
        preset_id: i64,
    ) -> rusqlite::Result<Option<ProjectAssignmentDetail>> {
        self.upsert_project_preset_assignment(project_id, preset_id, &json!({}))?;
        self.get_project_assignment_detail(project_id)
    }

    pub fn upsert_agent_project_preset_assignment(
        &self,
        project_id: i64,
        agent_id: i64,
        preset_id: i64,
        config_overrides: &serde_json::Value,
    ) -> rusqlite::Result<()> {
        let payload = serde_json::to_string(config_overrides)
            .map_err(|error| super::invalid_input(&error.to_string()))?;
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "INSERT INTO agent_project_preset_assignments (project_id, agent_id, preset_id, config_overrides)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(project_id, agent_id) DO UPDATE SET
               preset_id = excluded.preset_id,
               config_overrides = CASE
                 WHEN trim(excluded.config_overrides) IN ('', '{}') THEN agent_project_preset_assignments.config_overrides
                 ELSE excluded.config_overrides
               END,
               updated_at = datetime('now')",
            params![project_id, agent_id, preset_id, payload],
        )?;
        Ok(())
    }

    pub fn link_agent_project(&self, agent_id: i64, project_id: i64) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        let affected = conn.execute(
            "INSERT OR IGNORE INTO agent_projects (agent_id, project_id) VALUES (?1, ?2)",
            params![agent_id, project_id],
        )?;
        Ok(affected > 0)
    }

    pub fn unlink_agent_project(&self, agent_id: i64, project_id: i64) -> rusqlite::Result<bool> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        conn.execute(
            "DELETE FROM agent_project_preset_assignments
             WHERE project_id = ?1 AND agent_id = ?2",
            params![project_id, agent_id],
        )?;
        let affected = conn.execute(
            "DELETE FROM agent_projects WHERE agent_id = ?1 AND project_id = ?2",
            params![agent_id, project_id],
        )?;
        Ok(affected > 0)
    }

    pub fn find_agent_by_kind_and_config_path(
        &self,
        kind: &str,
        config_dir_path: &str,
    ) -> rusqlite::Result<Option<super::models::AgentRecord>> {
        let normalized = crate::agents::resolve::normalize_config_dir_path(config_dir_path)
            .map_err(|error| super::invalid_input(&error))?;
        Ok(self.list_agent_records()?.into_iter().find(|agent| {
            agent.kind == kind.trim() && agent.config_dir_path == normalized
        }))
    }

    pub fn find_agent_by_kind(&self, kind: &str) -> rusqlite::Result<Option<super::models::AgentRecord>> {
        Ok(self
            .list_agent_records()?
            .into_iter()
            .find(|agent| agent.kind == kind.trim()))
    }

    pub fn sync_legacy_agent_preset_assignments(&self) -> rusqlite::Result<()> {
        let conn = self.conn.lock().expect("database mutex poisoned");
        super::sync_legacy_agent_preset_assignments(&conn)
    }

    pub fn ensure_project_agent_preset(
        &self,
        project_id: i64,
        agent_id: i64,
    ) -> rusqlite::Result<i64> {
        if let Some(assignment) = self.get_agent_project_assignment_detail(project_id, agent_id)? {
            return Ok(assignment.preset_id);
        }

        let assignment = self
            .apply_custom_preset_to_agent(project_id, agent_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        Ok(assignment.preset_id)
    }

    pub fn backfill_linked_agents_without_assignment(
        &self,
        project_id: i64,
    ) -> rusqlite::Result<()> {
        for agent in self.list_project_agents(project_id)? {
            if self
                .get_agent_project_assignment_detail(project_id, agent.id)?
                .is_none()
            {
                let _ = self.apply_custom_preset_to_agent(project_id, agent.id)?;
            }
        }
        Ok(())
    }

    pub fn add_mcp_server_to_project_agent(
        &self,
        project_id: i64,
        agent_id: i64,
        mcp_server_id: i64,
    ) -> rusqlite::Result<ProjectAssignmentDetail> {
        if self.agent_uses_project_default_preset(project_id, agent_id)? {
            return Err(super::invalid_input(
                "cannot add servers to the project default preset; switch to custom preset first",
            ));
        }

        self.ensure_project_agent_preset(project_id, agent_id)?;

        let assignment = self
            .get_agent_project_assignment_detail(project_id, agent_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        let mut server_ids: Vec<i64> = assignment.servers.iter().map(|entry| entry.server.id).collect();
        if server_ids.contains(&mcp_server_id) {
            return Ok(assignment);
        }
        server_ids.push(mcp_server_id);
        self.set_preset_server_ids(assignment.preset_id, &server_ids)?;

        self.get_agent_project_assignment_detail(project_id, agent_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn remove_mcp_server_from_project_agent(
        &self,
        project_id: i64,
        agent_id: i64,
        mcp_server_id: i64,
    ) -> rusqlite::Result<ProjectAssignmentDetail> {
        if self.agent_uses_project_default_preset(project_id, agent_id)? {
            return Err(super::invalid_input(
                "cannot remove servers from the project default preset; switch to custom preset first",
            ));
        }

        let assignment = self
            .get_agent_project_assignment_detail(project_id, agent_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        let removed_keys: Vec<String> = assignment
            .servers
            .iter()
            .filter(|entry| entry.server.id == mcp_server_id)
            .flat_map(|entry| {
                let entry_key =
                    crate::agents::mcp_json::mcp_entry_key_for_server(&entry.server);
                let mut keys = vec![entry.server_key.trim().to_string()];
                if !entry_key.is_empty() && entry_key != keys[0] {
                    keys.push(entry_key);
                }
                let name = entry.server.name.trim();
                if !name.is_empty() && !keys.iter().any(|key| key == name) {
                    keys.push(name.to_string());
                }
                keys
            })
            .collect();

        let server_ids: Vec<i64> = assignment
            .servers
            .iter()
            .map(|entry| entry.server.id)
            .filter(|id| *id != mcp_server_id)
            .collect();

        self.set_preset_server_ids(assignment.preset_id, &server_ids)?;
        if !removed_keys.is_empty() {
            self.strip_server_keys_from_assignment_overrides(
                project_id,
                agent_id,
                &removed_keys,
            )?;
        }

        let remaining = self.list_project_agent_assignments_for_server(mcp_server_id)?;
        if remaining.is_empty() {
            let _ = self.clear_mcp_tool_prefs(mcp_server_id);
        }

        self.get_agent_project_assignment_detail(project_id, agent_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn strip_server_keys_from_assignment_overrides(
        &self,
        project_id: i64,
        agent_id: i64,
        server_keys: &[String],
    ) -> rusqlite::Result<bool> {
        if server_keys.is_empty() {
            return Ok(false);
        }

        let conn = self.conn.lock().expect("database mutex poisoned");
        let raw: Option<String> = conn
            .query_row(
                "SELECT config_overrides
                 FROM agent_project_preset_assignments
                 WHERE project_id = ?1 AND agent_id = ?2",
                params![project_id, agent_id],
                |row| row.get(0),
            )
            .optional()?;

        let Some(raw) = raw else {
            return Ok(false);
        };

        let mut root: serde_json::Value =
            serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}));
        let Some(obj) = root.as_object_mut() else {
            return Ok(false);
        };

        let mut changed = false;
        for key in server_keys {
            if obj.remove(key).is_some() {
                changed = true;
            }
        }
        if !changed {
            return Ok(false);
        }

        let payload = serde_json::to_string(&root)
            .map_err(|error| super::invalid_input(&error.to_string()))?;
        let affected = conn.execute(
            "UPDATE agent_project_preset_assignments
             SET config_overrides = ?1, updated_at = datetime('now')
             WHERE project_id = ?2 AND agent_id = ?3",
            params![payload, project_id, agent_id],
        )?;
        Ok(affected > 0)
    }
}

fn build_project_assignment_detail(
    conn: &rusqlite::Connection,
    preset_id: i64,
    config_overrides: String,
) -> rusqlite::Result<Option<ProjectAssignmentDetail>> {
    let preset_name = conn
        .query_row(
            "SELECT name FROM presets WHERE id = ?1",
            params![preset_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "Preset".to_string());

    let mut server_stmt = conn.prepare(
        "SELECT pms.server_key,
                ms.id, ms.name, ms.server_type, ms.path, ms.run_command,
                ms.json_config, ms.config_inputs, ms.config_values,
                ms.description, ms.created_at, ms.updated_at
         FROM preset_mcp_servers pms
         INNER JOIN mcp_servers ms ON ms.id = pms.mcp_server_id
         WHERE pms.preset_id = ?1
         ORDER BY pms.server_key ASC",
    )?;
    let server_rows = server_stmt.query_map(params![preset_id], |row| {
        Ok(ProjectPresetServerDetail {
            server_key: row.get(0)?,
            server: super::map_mcp_server_row_at(row, 1)?,
        })
    })?;

    Ok(Some(ProjectAssignmentDetail {
        preset_id,
        preset_name,
        config_overrides,
        servers: server_rows.collect::<Result<Vec<_>, _>>()?,
    }))
}

fn fetch_project_record(
    conn: &rusqlite::Connection,
    id: i64,
) -> rusqlite::Result<Option<ProjectRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_path, name, icon_color, created_at, updated_at
         FROM projects WHERE id = ?1",
    )?;
    stmt.query_row(params![id], map_project_row).optional()
}

fn map_project_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectRecord> {
    Ok(ProjectRecord {
        id: row.get(0)?,
        folder_path: row.get(1)?,
        name: row.get(2)?,
        icon_color: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}
