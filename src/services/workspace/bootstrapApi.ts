import { invoke } from "@tauri-apps/api/core";

export type LegacyProjectInput = {
  name: string;
  folderPath: string;
  iconColor?: string;
};

export type LegacyPresetInput = {
  name: string;
  mcpServerIds?: number[];
};

export type WorkspaceBootstrapRequest = {
  force?: boolean;
  legacyProjects?: LegacyProjectInput[];
  legacyPresets?: LegacyPresetInput[];
};

export type WorkspaceBootstrapResult = {
  completed: boolean;
  skipped: boolean;
  agentsDiscovered: number;
  agentsCreated: number;
  projectsDiscovered: number;
  projectsUpserted: number;
  linksCreated: number;
  presetsCreated: number;
  assignmentsCreated: number;
  agentIds: number[];
};

export type WorkspaceBootstrapStatus = {
  completed: boolean;
};

export function getWorkspaceBootstrapStatus() {
  return invoke<WorkspaceBootstrapStatus>("workspace_get_bootstrap_status");
}

export function runWorkspaceBootstrap(request: WorkspaceBootstrapRequest = {}) {
  return invoke<WorkspaceBootstrapResult>("workspace_bootstrap", { request });
}
