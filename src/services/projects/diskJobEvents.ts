import { listen } from "@tauri-apps/api/event";
import { notifyProjectsChanged } from "./recordsApi";

export const PROJECT_DISK_JOB_FAILED_EVENT = "project-disk-job-failed";
export const PROJECT_DISK_JOB_COMPLETED_EVENT = "project-disk-job-completed";

export const PROJECT_DISK_JOB_FAILED_UI_EVENT = "tasedeck:project-disk-job-failed";
export const PROJECT_DISK_JOB_COMPLETED_UI_EVENT = "tasedeck:project-disk-job-completed";

export type ProjectDiskJobFailedPayload = {
  projectId: number;
  agentName: string;
  message: string;
};

export type ProjectDiskJobCompletedPayload = {
  projectId: number;
};

export function formatProjectDiskJobFailedToast(agentName: string): string {
  return `${agentName} temporarily locked the settings. Your changes are saved in TaseDeck but were not written to disk. Reopen this project or tap Retry to try again.`;
}

export function listenProjectDiskJobFailed(
  onFailed: (payload: ProjectDiskJobFailedPayload) => void,
): Promise<() => void> {
  return listen<ProjectDiskJobFailedPayload>(PROJECT_DISK_JOB_FAILED_EVENT, (event) => {
    const payload = event.payload;
    onFailed(payload);
    notifyProjectsChanged();
    window.dispatchEvent(
      new CustomEvent(PROJECT_DISK_JOB_FAILED_UI_EVENT, { detail: payload }),
    );
  }).then((unlisten) => unlisten);
}

export function listenProjectDiskJobCompleted(
  onCompleted: (payload: ProjectDiskJobCompletedPayload) => void,
): Promise<() => void> {
  return listen<ProjectDiskJobCompletedPayload>(PROJECT_DISK_JOB_COMPLETED_EVENT, (event) => {
    const payload = event.payload;
    onCompleted(payload);
    notifyProjectsChanged();
    window.dispatchEvent(
      new CustomEvent(PROJECT_DISK_JOB_COMPLETED_UI_EVENT, { detail: payload }),
    );
  }).then((unlisten) => unlisten);
}
