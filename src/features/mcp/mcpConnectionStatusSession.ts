import type { McpListCardConnectionStatus } from "./mcpConnectionListStatus";

const statusByServerId = new Map<number, McpListCardConnectionStatus>();
const probedServerIds = new Set<number>();

export function getCachedMcpConnectionStatus(
  serverId: number,
): McpListCardConnectionStatus | undefined {
  if (!probedServerIds.has(serverId)) {
    return undefined;
  }
  return statusByServerId.get(serverId);
}

export function setCachedMcpConnectionStatus(
  serverId: number,
  status: McpListCardConnectionStatus,
) {
  probedServerIds.add(serverId);
  statusByServerId.set(serverId, status);
}

export function hasCachedMcpConnectionStatus(serverId: number) {
  return probedServerIds.has(serverId);
}

export function clearCachedMcpConnectionStatus(serverId: number) {
  probedServerIds.delete(serverId);
  statusByServerId.delete(serverId);
}

export function snapshotCachedMcpConnectionStatuses(
  serverIds: Iterable<number>,
): Record<number, McpListCardConnectionStatus> {
  const snapshot: Record<number, McpListCardConnectionStatus> = {};
  for (const serverId of serverIds) {
    if (probedServerIds.has(serverId)) {
      const status = statusByServerId.get(serverId);
      if (status) {
        snapshot[serverId] = status;
      }
    }
  }
  return snapshot;
}

export function snapshotConnectedMcpIds(serverIds: Iterable<number>): Set<number> {
  const connected = new Set<number>();
  for (const serverId of serverIds) {
    if (statusByServerId.get(serverId) === "connected") {
      connected.add(serverId);
    }
  }
  return connected;
}
