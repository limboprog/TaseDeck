use crate::agents::project_proxy_export::{
    schedule_project_proxy_export, sync_project_agent_proxy_mcp,
    sync_project_proxy_mcp_for_all_agents, sync_project_tasedeck_mcp_merged, ProxyExportScope,
};
use crate::db::{
    Database, PresetRecord, ProjectAssignmentDetail, ProjectDetailRecord, ProjectRecord,
    WorkspaceBootstrapRequest, WorkspaceBootstrapResult, WorkspaceBootstrapStatus,
};
use crate::error::{AppError, AppResult};
use crate::services::workspace_bootstrap::{
    run_workspace_bootstrap_shared, workspace_bootstrap_status,
};
use crate::services::ProxyLogIngestor;
use crate::services::{McpToolsStore, OAuthStore};
use std::sync::Arc;
use tauri::State;

fn export_project_agent_mcp(
    db: &Database,
    oauth: Option<&OAuthStore>,
    tools_store: Option<&McpToolsStore>,
    ingestor: Option<&ProxyLogIngestor>,
    project_id: i64,
    agent_id: i64,
) -> Result<Vec<String>, AppError> {
    let written = sync_project_agent_proxy_mcp(
        db,
        oauth,
        tools_store,
        project_id,
        agent_id,
    )
    .map_err(AppError::Message)?;
    if let Some(ingestor) = ingestor {
        let _ = ingestor.poll_once();
    }
    Ok(written)
}

fn schedule_project_agent_export(
    db: &Arc<Database>,
    oauth: &Arc<OAuthStore>,
    tools_store: &Arc<McpToolsStore>,
    project_id: i64,
    agent_id: i64,
    extra_kinds_to_clean: Vec<String>,
    scope: ProxyExportScope,
) {
    schedule_project_proxy_export(
        Arc::clone(db),
        Arc::clone(oauth),
        Arc::clone(tools_store),
        project_id,
        agent_id,
        extra_kinds_to_clean,
        scope,
    );
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

fn sync_project_mcp_export_full(
    db: &Database,
    oauth: &OAuthStore,
    tools_store: &McpToolsStore,
    project_id: i64,
) -> Result<(), AppError> {
    if db
        .list_project_agents(project_id)
        .map_err(|error| AppError::Message(error.to_string()))?
        .is_empty()
    {
        return Ok(());
    }
    sync_project_tasedeck_mcp_merged(
        db,
        Some(oauth),
        Some(tools_store),
        project_id,
        &[],
        ProxyExportScope::Full,
    )
    .map_err(AppError::Message)?;
    Ok(())
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
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
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
        let _ = sync_project_mcp_export_full(
            db.inner(),
            oauth.inner(),
            tools_store.inner(),
            project.id,
        );
    }
    Ok(project)
}

#[tauri::command]
pub async fn project_record_delete(db: State<'_, Arc<Database>>, id: i64) -> AppResult<bool> {
    let db = Arc::clone(db.inner());
    tauri::async_runtime::spawn_blocking(move || db.delete_project_record(id))
        .await
        .map_err(|error| crate::error::AppError::Message(error.to_string()))?
        .map_err(Into::into)
}

#[tauri::command]
pub fn project_record_get_detail(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    id: i64,
) -> AppResult<Option<ProjectDetailRecord>> {
    let native_mcp_imported =
        crate::agents::project_mcp_import::import_native_mcp_servers_for_project(db.inner(), id)
            .unwrap_or(false);
    if native_mcp_imported {
        let _ = sync_project_mcp_export_full(db.inner(), oauth.inner(), tools_store.inner(), id);
    }
    db.backfill_linked_agents_without_assignment(id)
        .map_err(|error| AppError::Message(error.to_string()))?;
    backfill_project_default_source_mcp_json(db.inner(), id);
    let mut detail = db.get_project_detail(id)?;
    if let Some(record) = detail.as_mut() {
        record.native_mcp_imported = native_mcp_imported;
    }
    Ok(detail)
}

#[tauri::command]
pub fn project_record_add_server(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    project_id: i64,
    agent_id: i64,
    mcp_server_id: i64,
) -> AppResult<ProjectAssignmentDetail> {
    db.add_mcp_server_to_project_agent(project_id, agent_id, mcp_server_id)?;
    sync_project_tasedeck_mcp_merged(
        db.inner(),
        Some(oauth.inner()),
        Some(tools_store.inner()),
        project_id,
        &[],
        ProxyExportScope::Full,
    )
    .map_err(AppError::Message)?;
    assignment_detail(db.inner(), project_id, agent_id)
}

#[tauri::command]
pub fn project_record_remove_server(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    project_id: i64,
    agent_id: i64,
    mcp_server_id: i64,
) -> AppResult<ProjectAssignmentDetail> {
    db.remove_mcp_server_from_project_agent(project_id, agent_id, mcp_server_id)?;
    sync_project_tasedeck_mcp_merged(
        db.inner(),
        Some(oauth.inner()),
        Some(tools_store.inner()),
        project_id,
        &[],
        ProxyExportScope::Full,
    )
    .map_err(AppError::Message)?;
    assignment_detail(db.inner(), project_id, agent_id)
}

#[tauri::command]
pub fn project_record_update_assignment(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
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
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    project_id: i64,
    agent_id: i64,
    preset_id: i64,
) -> AppResult<Option<ProjectAssignmentDetail>> {
    Ok(db.assign_agent_project_preset(project_id, agent_id, preset_id)?)
}

#[tauri::command]
pub fn project_record_unassign_preset(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<bool> {
    Ok(db.unassign_agent_project_preset(project_id, agent_id)?)
}

#[tauri::command]
pub fn project_record_use_default_preset(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<Option<ProjectAssignmentDetail>> {
    let assignment = db
        .apply_default_preset_to_agent(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?;
    if assignment.is_some() {
        sync_project_mcp_export_full(db.inner(), oauth.inner(), tools_store.inner(), project_id)?;
    }
    Ok(assignment)
}

#[tauri::command]
pub fn project_record_use_custom_preset(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<Option<ProjectAssignmentDetail>> {
    let assignment = db
        .apply_custom_preset_to_agent(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?;
    if assignment.is_some() {
        sync_project_mcp_export_full(db.inner(), oauth.inner(), tools_store.inner(), project_id)?;
    }
    Ok(assignment)
}

#[tauri::command]
pub fn project_record_delete_custom_preset(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<Option<ProjectAssignmentDetail>> {
    let assignment = db
        .delete_agent_custom_preset(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?;
    if assignment.is_some() {
        sync_project_mcp_export_full(db.inner(), oauth.inner(), tools_store.inner(), project_id)?;
    }
    Ok(assignment)
}

#[tauri::command]
pub fn project_record_link_agent(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
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
        sync_project_mcp_export_full(db.inner(), oauth.inner(), tools_store.inner(), project_id)?;
    }

    Ok(true)
}

#[tauri::command]
pub fn project_record_export_proxy_config(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    ingestor: State<'_, Arc<ProxyLogIngestor>>,
    project_id: i64,
    agent_id: Option<i64>,
) -> AppResult<Vec<String>> {
    let written = if let Some(agent_id) = agent_id {
        export_project_agent_mcp(
            db.inner(),
            Some(oauth.inner()),
            Some(tools_store.inner()),
            Some(ingestor.inner()),
            project_id,
            agent_id,
        )?
    } else {
        let paths = sync_project_proxy_mcp_for_all_agents(
            db.inner(),
            Some(oauth.inner()),
            Some(tools_store.inner()),
            project_id,
        )
        .map_err(AppError::Message)?;
        let _ = ingestor.poll_once();
        paths
    };
    Ok(written)
}

#[tauri::command]
pub fn project_record_unlink_agent(
    db: State<'_, Arc<Database>>,
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<bool> {
    let agent_kind = db
        .get_agent_record(agent_id)?
        .map(|agent| agent.kind);
    let removed = db.unlink_agent_project(agent_id, project_id)?;
    if removed {
        let extra_kinds = agent_kind.map(|kind| vec![kind]).unwrap_or_default();
        schedule_project_agent_export(
            db.inner(),
            oauth.inner(),
            tools_store.inner(),
            project_id,
            agent_id,
            extra_kinds,
            ProxyExportScope::Full,
        );
    }
    Ok(removed)
}

#[tauri::command]
pub fn project_record_reset_agent(
    db: State<'_, Arc<Database>>,
    project_id: i64,
    agent_id: i64,
) -> AppResult<bool> {
    let agent = db
        .get_agent_record(agent_id)?
        .ok_or_else(|| AppError::Message(format!("agent {agent_id} not found")))?;
    let project = db
        .get_project_record(project_id)?
        .ok_or_else(|| AppError::Message(format!("project {project_id} not found")))?;
    let project_root = crate::agents::project_discovery::normalize_folder_path(
        project.folder_path.trim(),
    )
    .ok_or_else(|| AppError::Message("invalid project folder path".into()))?;

    let snapshot = db.get_project_default_source_mcp_json(project_id)?;
    crate::agents::mcp_json::restore_project_mcp_json_to_snapshot(
        &project_root,
        &agent.kind,
        snapshot.as_deref(),
    )
    .map_err(AppError::Message)?;

    db.purge_agent_custom_preset_records(project_id, agent_id)
        .map_err(|error| AppError::Message(error.to_string()))?;

    Ok(db.unlink_agent_project(agent_id, project_id)?)
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
    oauth: State<'_, Arc<OAuthStore>>,
    tools_store: State<'_, Arc<McpToolsStore>>,
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
        schedule_project_agent_export(
            db.inner(),
            oauth.inner(),
            tools_store.inner(),
            project_id,
            agent_id,
            Vec::new(),
            ProxyExportScope::Full,
        );
    }
    Ok(PresetTryDeleteResult { deleted, in_use: false })
}

#[tauri::command]
pub fn preset_record_delete(db: State<'_, Arc<Database>>, id: i64) -> AppResult<bool> {
    Ok(db.delete_preset_record(id)?)
}
