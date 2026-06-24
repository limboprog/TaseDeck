import { createId } from "../topology/storage";
import { isProjectIconColor, pickRandomProjectIconColor, resolveProjectIconColor } from "./iconColors";
import type { Project, ProjectDraft } from "./types";

const STORAGE_KEY = "tasedeck:projects";

export const PROJECTS_CHANGED_EVENT = "projects-changed";

export function notifyProjectsChanged() {
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
}

function normalizeProjects(parsed: Project[]): Project[] {
  return parsed
    .filter(
      (project) =>
        project &&
        typeof project.id === "string" &&
        typeof project.name === "string" &&
        typeof project.folderPath === "string",
    )
    .map((project) => ({
      ...project,
      iconColor: resolveProjectIconColor(project.iconColor),
    }));
}

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Project[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    const normalized = normalizeProjects(parsed);
    const needsPersist = parsed.some(
      (project) =>
        project &&
        typeof project.id === "string" &&
        typeof project.name === "string" &&
        typeof project.folderPath === "string" &&
        !isProjectIconColor(project.iconColor ?? ""),
    );
    if (needsPersist) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return [];
  }
}

export function getStoredProjects(): Project[] {
  return loadProjects();
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  notifyProjectsChanged();
}

export function clearStoredProjects() {
  localStorage.removeItem(STORAGE_KEY);
  notifyProjectsChanged();
}

export function createProject(draft: ProjectDraft): Project {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: draft.name.trim(),
    folderPath: draft.folderPath.trim(),
    iconColor: draft.iconColor ?? pickRandomProjectIconColor(),
    createdAt: now,
    updatedAt: now,
    diskSyncPending: false,
  };
}

export function addStoredProject(draft: ProjectDraft): Project {
  const project = createProject(draft);
  const stored = loadProjects();
  saveProjects([project, ...stored]);
  return project;
}

export function removeStoredProject(id: string) {
  saveProjects(loadProjects().filter((project) => project.id !== id));
}
