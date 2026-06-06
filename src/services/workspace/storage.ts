import type { Workspace } from "./types";

const STORAGE_KEY = "tasedeck:workspaces";

export function createEntryId() {
  return crypto.randomUUID();
}

export function nameFromPath(path: string) {
  const trimmed = path.trim().replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed || "Untitled";
}

function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Workspace[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkspaces(workspaces: Workspace[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
}

export function getStoredWorkspaces(): Workspace[] {
  return loadWorkspaces();
}

export function createWorkspace(
  draft: Pick<Workspace, "name" | "agents" | "mcps">,
): Workspace {
  const now = new Date().toISOString();
  return {
    id: createEntryId(),
    name: draft.name.trim(),
    agents: draft.agents,
    mcps: draft.mcps,
    createdAt: now,
    updatedAt: now,
  };
}
