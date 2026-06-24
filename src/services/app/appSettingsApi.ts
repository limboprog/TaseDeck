import { invoke } from "@tauri-apps/api/core";

export type AppSettings = {
  useOsKeyring: boolean;
  setupCompleted: boolean;
  enableFileScan: boolean;
  enableAgentSync: boolean;
  enableToolIndex: boolean;
  enableLogCollection: boolean;
  nodePath?: string | null;
};

export type NodeRuntimeStatus = {
  found: boolean;
  path?: string | null;
  version?: string | null;
  source: string;
};

export const defaultAppSettings = (): AppSettings => ({
  useOsKeyring: false,
  setupCompleted: false,
  enableFileScan: true,
  enableAgentSync: true,
  enableToolIndex: true,
  enableLogCollection: true,
  nodePath: null,
});

export function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("app_get_settings");
}

export function saveAppSetupSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("app_save_setup_settings", { settings });
}

export function completeInitialSetup(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("app_complete_initial_setup", { settings });
}

export function setNodePath(path: string | null): Promise<AppSettings> {
  return invoke<AppSettings>("app_set_node_path", { path });
}

export function getNodeRuntimeStatus(): Promise<NodeRuntimeStatus> {
  return invoke<NodeRuntimeStatus>("app_get_node_runtime_status");
}

export function validateNodePath(path: string): Promise<string> {
  return invoke<string>("app_validate_node_path", { path });
}

export function downloadNodeRuntime(): Promise<string> {
  return invoke<string>("app_download_node_runtime");
}

export async function pickNodeExecutable(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Select Node.js binary",
  });
  if (selected === null || Array.isArray(selected)) {
    return null;
  }
  return selected;
}
