import { invoke } from "@tauri-apps/api/core";
import type { InstalledMcpServer } from "../mcp_installed";
import type { AgentRecord } from "../agents/recordsApi";
import type { Project } from "./types";
import { projectRecordToProject, type ProjectRecord } from "./recordsApi";

export type ProjectPresetServerDetail = {
  serverKey: string;
  server: InstalledMcpServer;
};

export type ProjectAssignmentDetail = {
  presetId: number;
  presetName: string;
  configOverrides: string;
  servers: ProjectPresetServerDetail[];
};

export type ProjectAgentAssignment = {
  agentId: number;
  assignment: ProjectAssignmentDetail | null;
  hasCustomPreset: boolean;
};

export type ProjectDetail = {
  project: Project;
  agents: AgentRecord[];
  defaultAssignment: ProjectAssignmentDetail | null;
  agentAssignments: ProjectAgentAssignment[];
  nativeMcpImported: boolean;
  defaultSourceMcpJson: string | null;
};

export type AgentPresetMode = "default" | "custom";

export function resolveAgentPresetMode(
  detail: ProjectDetail,
  agentId: number,
): AgentPresetMode {
  const assignment = getAgentAssignment(detail, agentId);
  const defaultAssignment = detail.defaultAssignment;
  if (!assignment || !defaultAssignment) {
    return "custom";
  }
  return assignment.presetId === defaultAssignment.presetId ? "default" : "custom";
}

export function agentHasCustomPreset(detail: ProjectDetail, agentId: number): boolean {
  return (
    detail.agentAssignments.find((entry) => entry.agentId === agentId)?.hasCustomPreset ?? false
  );
}

function mapAssignment(
  assignment: NonNullable<ProjectDetailRecord["assignment"]>,
): ProjectAssignmentDetail {
  return {
    presetId: assignment.presetId,
    presetName: assignment.presetName,
    configOverrides: assignment.configOverrides,
    servers: assignment.servers,
  };
}

function mapOptionalAssignment(
  assignment: ProjectDetailRecord["assignment"] | null | undefined,
): ProjectAssignmentDetail | null {
  if (!assignment) {
    return null;
  }
  return mapAssignment(assignment);
}

type ProjectDetailRecord = {
  project: ProjectRecord;
  agents: AgentRecord[];
  agentAssignments?: Array<{
    agentId: number;
    assignment: {
      presetId: number;
      presetName: string;
      configOverrides: string;
      servers: Array<{
        serverKey: string;
        server: InstalledMcpServer;
      }>;
    } | null;
    hasCustomPreset?: boolean;
  }>;
  defaultAssignment?: {
    presetId: number;
    presetName: string;
    configOverrides: string;
    servers: Array<{
      serverKey: string;
      server: InstalledMcpServer;
    }>;
  } | null;
  nativeMcpImported?: boolean;
  defaultSourceMcpJson?: string | null;
  /** Legacy single-assignment payload from older backend builds. */
  assignment?: {
    presetId: number;
    presetName: string;
    configOverrides: string;
    servers: Array<{
      serverKey: string;
      server: InstalledMcpServer;
    }>;
  } | null;
};

function mapProjectDetail(record: ProjectDetailRecord): ProjectDetail {
  const legacyAssignment = record.assignment
    ? mapOptionalAssignment(record.assignment)
    : null;

  const agentAssignments =
    record.agentAssignments?.map((entry) => ({
      agentId: entry.agentId,
      assignment: mapOptionalAssignment(entry.assignment),
      hasCustomPreset: entry.hasCustomPreset ?? false,
    })) ??
    record.agents.map((agent) => ({
      agentId: agent.id,
      assignment: legacyAssignment,
      hasCustomPreset: false,
    }));

  return {
    project: projectRecordToProject(record.project),
    agents: record.agents,
    defaultAssignment: mapOptionalAssignment(record.defaultAssignment),
    agentAssignments,
    nativeMcpImported: record.nativeMcpImported ?? false,
    defaultSourceMcpJson: record.defaultSourceMcpJson ?? null,
  };
}

export function getAgentAssignment(
  detail: ProjectDetail,
  agentId: number,
): ProjectAssignmentDetail | null {
  return (
    detail.agentAssignments.find((entry) => entry.agentId === agentId)?.assignment ?? null
  );
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const numericId = Number(projectId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null;
  }
  const record = await invoke<ProjectDetailRecord | null>("project_record_get_detail", {
    id: numericId,
  });
  return record ? mapProjectDetail(record) : null;
}

export async function assignProjectPreset(
  projectId: string,
  agentId: number,
  presetId: string,
): Promise<ProjectAssignmentDetail | null> {
  const numericProjectId = Number(projectId);
  const numericPresetId = Number(presetId);
  if (
    !Number.isFinite(numericProjectId) ||
    numericProjectId <= 0 ||
    !Number.isFinite(numericPresetId) ||
    numericPresetId <= 0 ||
    agentId <= 0
  ) {
    return null;
  }
  const assignment = await invoke<ProjectAssignmentDetail | null>("project_record_assign_preset", {
    projectId: numericProjectId,
    agentId,
    presetId: numericPresetId,
  });
  return assignment;
}

export async function deleteProjectCustomPreset(
  projectId: string,
  agentId: number,
): Promise<ProjectAssignmentDetail | null> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0 || agentId <= 0) {
    return null;
  }
  return invoke<ProjectAssignmentDetail | null>("project_record_delete_custom_preset", {
    projectId: numericProjectId,
    agentId,
  });
}

export async function useProjectDefaultPreset(
  projectId: string,
  agentId: number,
): Promise<ProjectAssignmentDetail | null> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0 || agentId <= 0) {
    return null;
  }
  return invoke<ProjectAssignmentDetail | null>("project_record_use_default_preset", {
    projectId: numericProjectId,
    agentId,
  });
}

export async function useProjectCustomPreset(
  projectId: string,
  agentId: number,
): Promise<ProjectAssignmentDetail | null> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0 || agentId <= 0) {
    return null;
  }
  return invoke<ProjectAssignmentDetail | null>("project_record_use_custom_preset", {
    projectId: numericProjectId,
    agentId,
  });
}

export async function unassignProjectPreset(
  projectId: string,
  agentId: number,
): Promise<boolean> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0 || agentId <= 0) {
    return false;
  }
  return invoke<boolean>("project_record_unassign_preset", {
    projectId: numericProjectId,
    agentId,
  });
}

export async function unlinkProjectAgent(projectId: string, agentId: number): Promise<boolean> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0 || agentId <= 0) {
    return false;
  }
  return invoke<boolean>("project_record_unlink_agent", {
    projectId: numericProjectId,
    agentId,
  });
}

export async function resetProjectAgent(projectId: string, agentId: number): Promise<boolean> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0 || agentId <= 0) {
    return false;
  }
  return invoke<boolean>("project_record_reset_agent", {
    projectId: numericProjectId,
    agentId,
  });
}

export async function linkProjectAgent(projectId: string, agentId: number): Promise<boolean> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0 || agentId <= 0) {
    return false;
  }
  return invoke<boolean>("project_record_link_agent", {
    projectId: numericProjectId,
    agentId,
  });
}

export async function updateProjectAssignmentOverrides(
  projectId: string,
  agentId: number,
  configOverrides: string,
): Promise<boolean> {
  const numericId = Number(projectId);
  if (!Number.isFinite(numericId) || numericId <= 0 || agentId <= 0) {
    return false;
  }
  return invoke<boolean>("project_record_update_assignment", {
    projectId: numericId,
    agentId,
    configOverrides,
  });
}

export async function addProjectServer(
  projectId: string,
  agentId: number,
  mcpServerId: number,
): Promise<ProjectAssignmentDetail> {
  const numericProjectId = Number(projectId);
  if (
    !Number.isFinite(numericProjectId) ||
    numericProjectId <= 0 ||
    agentId <= 0 ||
    mcpServerId <= 0
  ) {
    throw new Error("Invalid project server add request");
  }
  return invoke<ProjectAssignmentDetail>("project_record_add_server", {
    projectId: numericProjectId,
    agentId,
    mcpServerId,
  });
}

export async function removeProjectServer(
  projectId: string,
  agentId: number,
  mcpServerId: number,
): Promise<ProjectAssignmentDetail> {
  const numericProjectId = Number(projectId);
  if (
    !Number.isFinite(numericProjectId) ||
    numericProjectId <= 0 ||
    agentId <= 0 ||
    mcpServerId <= 0
  ) {
    throw new Error("Invalid project server remove request");
  }
  return invoke<ProjectAssignmentDetail>("project_record_remove_server", {
    projectId: numericProjectId,
    agentId,
    mcpServerId,
  });
}

export async function exportProjectProxyConfig(
  projectId: string,
  agentId?: number,
): Promise<string[]> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
    return [];
  }
  return invoke<string[]>("project_record_export_proxy_config", {
    projectId: numericProjectId,
    agentId: agentId ?? null,
  });
}
