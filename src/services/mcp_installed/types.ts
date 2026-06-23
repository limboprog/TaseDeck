import type { ConfigInput } from "../mcp_registry/parser";
import type { RunCommandsState } from "./runCommands";

export type McpServerType = "local" | "remote";

export type McpEnvVariableRow = {
  id: string;
  name: string;
  value: string;
};

export type McpHeaderVariableRow = {
  id: string;
  name: string;
  value: string;
};

export type McpServerAnalysis = {
  runCommands: RunCommandsState;
  configInputs: ConfigInput[];
  envVariables: McpEnvVariableRow[];
  headerVariables: McpHeaderVariableRow[];
  compiledCommandTemplate: string;
};

export type InstalledMcpServer = {
  id: number;
  name: string;
  type: McpServerType;
  path: string | null;
  runCommand: string;
  jsonConfig: string;
  configInputs: string;
  configValues: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  analysis?: McpServerAnalysis;
};

export type InstallMcpLocalRequest = {
  installCommand: string;
  server: InstalledMcpServer;
};

export const MCP_INSTALLED_EVENT = "mcp-installed";
export const MCP_REMOVED_EVENT = "mcp-removed";
export const MCP_CATALOG_CHANGED_EVENT = "mcp-catalog-changed";

export function notifyMcpCatalogChanged() {
  window.dispatchEvent(new CustomEvent(MCP_CATALOG_CHANGED_EVENT));
}

export function notifyMcpInstalled(server: InstalledMcpServer) {
  window.dispatchEvent(
    new CustomEvent(MCP_INSTALLED_EVENT, { detail: server }),
  );
}

export function notifyMcpRemoved(serverId: number) {
  window.dispatchEvent(
    new CustomEvent(MCP_REMOVED_EVENT, { detail: serverId }),
  );
}
