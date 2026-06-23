import type { McpServerToolsSnapshot } from "./toolsApi";

const snapshotByServerId = new Map<number, McpServerToolsSnapshot | null>();

export function getCachedMcpToolsSnapshot(
  serverId: number,
): McpServerToolsSnapshot | null | undefined {
  if (!snapshotByServerId.has(serverId)) {
    return undefined;
  }
  return snapshotByServerId.get(serverId) ?? null;
}

export function setCachedMcpToolsSnapshot(
  serverId: number,
  snapshot: McpServerToolsSnapshot | null,
) {
  snapshotByServerId.set(serverId, snapshot);
}

export function clearCachedMcpToolsSnapshot(serverId: number) {
  snapshotByServerId.delete(serverId);
}
