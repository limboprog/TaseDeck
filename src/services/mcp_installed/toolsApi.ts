import { invoke } from "@tauri-apps/api/core";

export type McpToolInfo = {
  name: string;
  description: string;
  inputSchema?: unknown;
};

export type McpServerToolsSnapshot = {
  serverId: number;
  serverName: string;
  tools: McpToolInfo[];
  error?: string;
};

export function getMcpTools(serverId: number) {
  return invoke<McpServerToolsSnapshot | null>("mcp_get_tools", { serverId });
}

/** Starts MCP process once per app session if needed; returns cached snapshot. */
export function ensureMcpTools(serverId: number) {
  return invoke<McpServerToolsSnapshot | null>("mcp_ensure_tools", { serverId });
}

export function refreshMcpTools(serverId: number) {
  return invoke<McpServerToolsSnapshot | null>("mcp_refresh_tools", { serverId });
}

export function startMcpServer(serverId: number) {
  return invoke<McpServerToolsSnapshot | null>("mcp_start_server", { serverId });
}

export function stopMcpServer(serverId: number) {
  return invoke<boolean>("mcp_stop_server", { serverId });
}

export function isMcpServerRunning(serverId: number) {
  return invoke<boolean>("mcp_is_running", { serverId });
}

export function getMcpToolPrefs(serverId: number) {
  return invoke<Record<string, boolean>>("mcp_get_tool_prefs", { serverId });
}

export function setMcpToolPref(serverId: number, toolName: string, enabled: boolean) {
  return invoke<boolean>("mcp_set_tool_pref", { serverId, toolName, enabled });
}

export function replaceMcpToolPrefs(serverId: number, prefs: Record<string, boolean>) {
  return invoke<boolean>("mcp_replace_tool_prefs", { serverId, prefs });
}
