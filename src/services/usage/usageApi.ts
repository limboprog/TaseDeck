import { invoke } from "@tauri-apps/api/core";

export type UsageLogEntry = {
  id: number;
  mcpName: string;
  toolName: string;
  caller: string;
  success: boolean;
  result: string;
  createdAt: string;
  projectId?: number | null;
};

export function listUsageEntries(limit?: number) {
  return invoke<UsageLogEntry[]>("usage_list_entries", { limit });
}
