import { invoke } from "@tauri-apps/api/core";
import { notifyMcpCatalogChanged } from "../mcp_installed/types";
import { resolveProjectIconColor, type ProjectIconColor } from "./iconColors";
import type { Project, ProjectDraft } from "./types";

export type ProjectRecord = {
  id: number;
  folderPath: string;
  name: string;
  iconColor: string;
  createdAt: string;
  updatedAt: string;
  diskSyncDirty?: boolean;
};

export const PROJECTS_CHANGED_EVENT = "projects-changed";

export function notifyProjectsChanged() {
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
}

export function projectRecordToProject(record: ProjectRecord): Project {
  return {
    id: String(record.id),
    name: record.name,
    folderPath: record.folderPath,
    iconColor: resolveProjectIconColor(record.iconColor) as ProjectIconColor,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    diskSyncPending: record.diskSyncDirty ?? false,
  };
}

export async function listProjectRecords(): Promise<Project[]> {
  const records = await invoke<ProjectRecord[]>("project_record_list");
  return records.map(projectRecordToProject);
}

export async function createProjectRecord(draft: ProjectDraft): Promise<Project> {
  const created = await invoke<ProjectRecord>("project_record_create", {
    folderPath: draft.folderPath.trim(),
    name: draft.name.trim(),
    iconColor: draft.iconColor ?? null,
  });
  notifyProjectsChanged();
  notifyMcpCatalogChanged();
  return projectRecordToProject(created);
}

export async function deleteProjectRecord(id: string): Promise<boolean> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return false;
  }
  const deleted = await invoke<boolean>("project_record_delete", { id: numericId });
  if (deleted) {
    notifyProjectsChanged();
  }
  return deleted;
}
