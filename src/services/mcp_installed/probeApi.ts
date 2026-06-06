import { invoke } from "@tauri-apps/api/core";

export type McpProbeResult = {
  success: boolean;
  result: string;
};

export type McpProbeOperation = "initialize" | "tools_list";

export function probeMcpOperation(serverId: number, operation: McpProbeOperation) {
  return invoke<McpProbeResult>("mcp_probe_operation", { serverId, operation });
}
