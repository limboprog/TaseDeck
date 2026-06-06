export type McpServerType = "local" | "remote";

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
};

export type InstallMcpLocalRequest = {
  installCommand: string;
  server: InstalledMcpServer;
};

export const MCP_INSTALLED_EVENT = "mcp-installed";
export const MCP_REMOVED_EVENT = "mcp-removed";

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
