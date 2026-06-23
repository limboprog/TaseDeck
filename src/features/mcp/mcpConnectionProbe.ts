import type { InstalledMcpServer } from "../../services/mcp_installed";
import { canAttemptMcpTools } from "../../services/mcp_installed/configState";
import { probeMcpOperation } from "../../services/mcp_installed/probeApi";
import {
  resolveMcpListCardConnectionStatusFromProbe,
  type McpListCardConnectionStatus,
} from "./mcpConnectionListStatus";
import { setCachedMcpConnectionStatus } from "./mcpConnectionStatusSession";

export const MCP_CONNECTION_STATUS_EVENT = "mcp-connection-status-updated";

export type McpConnectionStatusEventDetail = {
  serverId: number;
  status: McpListCardConnectionStatus;
};

const inflightProbes = new Map<number, Promise<McpListCardConnectionStatus | null>>();

export function emitMcpConnectionStatus(serverId: number, status: McpListCardConnectionStatus) {
  setCachedMcpConnectionStatus(serverId, status);
  window.dispatchEvent(
    new CustomEvent<McpConnectionStatusEventDetail>(MCP_CONNECTION_STATUS_EVENT, {
      detail: { serverId, status },
    }),
  );
}

export async function probeMcpConnectionStatus(
  server: InstalledMcpServer,
): Promise<McpListCardConnectionStatus | null> {
  if (!canAttemptMcpTools(server)) {
    return null;
  }

  const existing = inflightProbes.get(server.id);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      const result = await probeMcpOperation(server.id, "tools_list");
      const status = resolveMcpListCardConnectionStatusFromProbe(result);
      emitMcpConnectionStatus(server.id, status);
      return status;
    } catch {
      const status: McpListCardConnectionStatus = "failed";
      emitMcpConnectionStatus(server.id, status);
      return status;
    } finally {
      inflightProbes.delete(server.id);
    }
  })();

  inflightProbes.set(server.id, promise);
  return promise;
}

export function probeInstalledMcpConnections(servers: InstalledMcpServer[]) {
  for (const server of servers) {
    void probeMcpConnectionStatus(server);
  }
}
