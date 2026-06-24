use crate::db::{
    Database, PresetRecord, ProjectAssignmentDetail, ProjectDetailRecord, ProjectRecord,
    WorkspaceBootstrapRequest, WorkspaceBootstrapResult, WorkspaceBootstrapStatus,
};
use crate::error::{AppError, AppResult};
use crate::services::workspace_bootstrap::{
    run_workspace_bootstrap_shared, workspace_bootstrap_status,
};
use crate::services::ProjectDiskQueue;
use std::sync::Arc;
use tauri::State;

fn enqueue_project_mcp_export_full(
    queue: &ProjectDiskQueue,
    project_id: i64,
    agent_id: Option<i64>,
) {
    queue.enqueue_export_full(project_id, agent_id, Vec::new());
}

fn assignment_detail(
    db: &Arc<Database>,
    project_id: i64,
    agent_id: i64,
) -> Result<ProjectAssignmentDetail, AppError> {
    db.get_agent_project_assignment_detail(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?
        .ok_or_else(|| {
            AppError::Message(format!(
                "assignment missing for project {project_id} agent {agent_id}"
            ))
        })
}

#[tauri::command]
pub fn workspace_get_bootstrap_status(db: State<'_, Arc<Database>>) -> AppResult<WorkspaceBootstrapStatus> {
    Ok(WorkspaceBootstrapStatus {
        completed: workspace_bootstrap_status(db.inner())?,
    })
}

#[tauri::command]
pub fn workspace_bootstrap(
    db: State<'_, Arc<Database>>,
    request: WorkspaceBootstrapRequest,
) -> AppResult<WorkspaceBootstrapResult> {
    run_workspace_bootstrap_shared(Arc::clone(db.inner()), request)
}

#[tauri::command]
pub fn project_record_list(db: State<'_, Arc<Database>>) -> AppResult<Vec<ProjectRecord>> {
    Ok(db.list_project_records()?)
}

#[tauri::command]
pub fn project_record_get(db: State<'_, Arc<Database>>, id: i64) -> AppResult<Option<ProjectRecord>> {
    Ok(db.get_project_record(id)?)
}

fn backfill_project_default_source_mcp_json(db: &Database, project_id: i64) {
    if db
        .get_project_default_source_mcp_json(project_id)
        .ok()
        .flatten()
        .is_some()
    {
        return;
    }
    let Ok(Some(project)) = db.get_project_record(project_id) else {
        return;
    };
    let Some(project_root) =
        crate::agents::project_discovery::normalize_folder_path(project.folder_path.trim())
    else {
        return;
    };
    if !project_root.is_dir() {
        return;
    }
    let Ok(agents) = db.list_project_agents(project_id) else {
        return;
    };
    let linked_kinds: Vec<String> = agents.into_iter().map(|agent| agent.kind).collect();
    let native_servers = crate::agents::project_mcp_import::collect_native_project_mcp_servers(
        &project_root,
        &linked_kinds,
    );
    if native_servers.is_empty() {
        return;
    }
    let source_json = crate::agents::project_mcp_import::native_mcp_source_json(&native_servers);
    let _ = db.set_project_default_source_mcp_json_if_empty(project_id, &source_json);
}

#[tauri::command]
pub fn project_record_create(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    folder_path: String,
    name: String,
    icon_color: Option<String>,
) -> AppResult<ProjectRecord> {
    let project = db.insert_project_record(
        &folder_path,
        &name,
        icon_color.as_deref(),
    )?;
    if crate::agents::project_mcp_import::import_native_mcp_servers_for_project(
        db.inner(),
        project.id,
    )
    .unwrap_or(false)
    {
        enqueue_project_mcp_export_full(disk_queue.inner(), project.id, None);
    }
    Ok(project)
}

#[tauri::command]
pub async fn project_record_delete(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    id: i64,
) -> AppResult<bool> {
    let db = Arc::clone(db.inner());
    let disk_queue = Arc::clone(disk_queue.inner());
    tauri::async_runtime::spawn_blocking(move || -> rusqlite::Result<bool> {
        let restore_kinds = db.list_project_disk_restore_kinds(id).unwrap_or_default();
        let deleted = db.delete_project_record(id)?;
        if deleted {
            for kind in restore_kinds {
                disk_queue.enqueue_restore_agent(id, None, kind);
            }
            disk_queue.release_project(id);
        }
        Ok(deleted)
    })
    .await
    .map_err(|error| crate::error::AppError::Message(error.to_string()))?
    .map_err(Into::into)
}

#[tauri::command]
pub fn project_record_get_detail(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    id: i64,
) -> AppResult<Option<ProjectDetailRecord>> {
    let native_mcp_imported =
        crate::agents::project_mcp_import::import_native_mcp_servers_for_project(db.inner(), id)
            .unwrap_or(false);
    if native_mcp_imported {
        enqueue_project_mcp_export_full(disk_queue.inner(), id, None);
    }
    disk_queue.retry_dirty_project(id);
    db.backfill_linked_agents_without_assignment(id)
        .map_err(|error| AppError::Message(error.to_string()))?;
    backfill_project_default_source_mcp_json(db.inner(), id);
    let mut detail = db.get_project_detail(id)?;
    if let Some(record) = detail.as_mut() {
        record.native_mcp_imported = native_mcp_imported;
        record.disk_sync_pending =
            record.project.disk_sync_dirty || disk_queue.is_project_dirty(id);
    }
    Ok(detail)
}

#[tauri::command]
pub fn project_record_retry_export(
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
) -> AppResult<bool> {
    let was_dirty = disk_queue.is_project_dirty(project_id);
    disk_queue.retry_dirty_project(project_id);
    Ok(was_dirty)
}

#[tauri::command]
pub fn project_record_add_server(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
    agent_id: i64,
    mcp_server_id: i64,
) -> AppResult<ProjectAssignmentDetail> {
    db.add_mcp_server_to_project_agent(project_id, agent_id, mcp_server_id)?;
    disk_queue.enqueue_export_full(project_id, Some(agent_id), Vec::new());
    assignment_detail(db.inner(), project_id, agent_id)
}

#[tauri::command]
pub fn project_record_remove_server(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
    agent_id: i64,
    mcp_server_id: i64,
) -> AppResult<ProjectAssignmentDetail> {
    db.remove_mcp_server_from_project_agent(project_id, agent_id, mcp_server_id)?;
    disk_queue.enqueue_export_full(project_id, Some(agent_id), Vec::new());
    assignment_detail(db.inner(), project_id, agent_id)
}

#[tauri::command]
pub fn project_record_update_assignment(
    db: State<'_, Arc<Database>>,
    project_id: i64,
    agent_id: i64,
    config_overrides: String,
) -> AppResult<bool> {
    db.ensure_project_agent_preset(project_id, agent_id)?;
    let updated = db.update_agent_project_assignment_overrides(
        project_id,
        agent_id,
        &config_overrides,
    )?;
    if !updated {
        return Err(AppError::Message(format!(
            "failed to save project overrides for project {project_id} agent {agent_id}"
        )));
    }
    Ok(true)
}

#[tauri::command]
pub fn project_record_assign_preset(
    db: State<'_, Arc<Database>>,
    project_id: i64,
    agent_id: i64,
    preset_id: i64,
) -> AppResult<Option<ProjectAssignmentDetail>> {
    Ok(db.assign_agent_project_preset(project_id, agent_id, preset_id)?)
}

#[tauri::command]
pub fn project_record_unassign_preset(
    db: State<'_, Arc<Database>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<bool> {
    Ok(db.unassign_agent_project_preset(project_id, agent_id)?)
}

#[tauri::command]
pub fn project_record_use_default_preset(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<Option<ProjectAssignmentDetail>> {
    let assignment = db
        .apply_default_preset_to_agent(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?;
    if assignment.is_some() {
        enqueue_project_mcp_export_full(disk_queue.inner(), project_id, Some(agent_id));
    }
    Ok(assignment)
}

#[tauri::command]
pub fn project_record_use_custom_preset(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<Option<ProjectAssignmentDetail>> {
    let assignment = db
        .apply_custom_preset_to_agent(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?;
    if assignment.is_some() {
        enqueue_project_mcp_export_full(disk_queue.inner(), project_id, Some(agent_id));
    }
    Ok(assignment)
}

#[tauri::command]
pub fn project_record_delete_custom_preset(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<Option<ProjectAssignmentDetail>> {
    let agent_kind = db
        .get_agent_record(agent_id)?
        .map(|agent| agent.kind);
    let assignment = db
        .delete_agent_custom_preset(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?;
    if let (Some(_), Some(kind)) = (assignment.as_ref(), agent_kind) {
        disk_queue.enqueue_restore_then_export_full(
            project_id,
            Some(agent_id),
            kind,
            Vec::new(),
        );
    }
    Ok(assignment)
}

#[tauri::command]
pub fn project_record_link_agent(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<bool> {
    let linked = db.link_agent_project(agent_id, project_id)?;
    if !linked {
        return Ok(false);
    }

    let mut should_export = crate::agents::project_mcp_import::import_native_mcp_servers_for_project(
        db.inner(),
        project_id,
    )
    .unwrap_or(false);

    if db
        .apply_custom_preset_to_agent(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?
        .is_some()
    {
        should_export = true;
    }

    if should_export {
        enqueue_project_mcp_export_full(disk_queue.inner(), project_id, Some(agent_id));
    }

    Ok(true)
}

#[tauri::command]
pub fn project_record_export_proxy_config(
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
    agent_id: Option<i64>,
) -> AppResult<Vec<String>> {
    disk_queue.enqueue_export_full(project_id, agent_id, Vec::new());
    Ok(Vec::new())
}

#[tauri::command]
pub fn project_record_unlink_agent(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<bool> {
    let agent_kind = db
        .get_agent_record(agent_id)?
        .map(|agent| agent.kind);
    let removed = db.unlink_agent_project(agent_id, project_id)?;
    if removed {
        if let Some(kind) = agent_kind {
            disk_queue.enqueue_restore_then_export_full(
                project_id,
                Some(agent_id),
                kind.clone(),
                vec![kind],
            );
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn project_record_reset_agent(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<bool> {
    let agent = db
        .get_agent_record(agent_id)?
        .ok_or_else(|| AppError::Message(format!("agent {agent_id} not found")))?;

    db.purge_agent_custom_preset_records(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?;

    let removed = db.unlink_agent_project(agent_id, project_id)?;
    if removed {
        disk_queue.enqueue_restore_agent(project_id, Some(agent_id), agent.kind);
    }
    Ok(removed)
}

#[tauri::command]
pub fn preset_record_list(db: State<'_, Arc<Database>>) -> AppResult<Vec<PresetRecord>> {
    Ok(db.list_preset_records()?)
}

#[tauri::command]
pub fn preset_record_create(db: State<'_, Arc<Database>>, name: String) -> AppResult<PresetRecord> {
    Ok(db.insert_preset_record(&name)?)
}

#[tauri::command]
pub fn preset_record_update(
    db: State<'_, Arc<Database>>,
    id: i64,
    name: Option<String>,
    mcp_server_ids: Option<Vec<i64>>,
) -> AppResult<PresetRecord> {
    Ok(db.update_preset_record(
        id,
        name.as_deref(),
        mcp_server_ids.as_deref(),
    )?)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetTryDeleteResult {
    pub deleted: bool,
    pub in_use: bool,
}

#[tauri::command]
pub fn preset_record_try_delete(
    db: State<'_, Arc<Database>>,
    disk_queue: State<'_, Arc<ProjectDiskQueue>>,
    id: i64,
) -> AppResult<PresetTryDeleteResult> {
    let (deleted, in_use, unassigned) = db.try_delete_preset_if_unused(id)?;
    if in_use {
        return Ok(PresetTryDeleteResult {
            deleted: false,
            in_use: true,
        });
    }
    for (project_id, agent_id) in unassigned {
        if let Ok(Some(agent)) = db.get_agent_record(agent_id) {
            disk_queue.enqueue_restore_then_export_full(
                project_id,
                Some(agent_id),
                agent.kind,
                Vec::new(),
            );
        }
    }
    Ok(PresetTryDeleteResult { deleted, in_use: false })
}

#[tauri::command]
pub fn preset_record_delete(db: State<'_, Arc<Database>>, id: i64) -> AppResult<bool> {
    Ok(db.delete_preset_record(id)?)
}
