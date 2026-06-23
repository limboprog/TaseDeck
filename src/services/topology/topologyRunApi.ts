import { invoke } from "@tauri-apps/api/core";

export const TOPOLOGY_RUN_CHANGED_EVENT = "topology-run-changed";

export function notifyTopologyRunChanged() {
  window.dispatchEvent(new CustomEvent(TOPOLOGY_RUN_CHANGED_EVENT));
}

export type TopologyServerInfo = {
  id: number;
  name: string;
  running: boolean;
  toolCount: number;
};

export type TopologyAggregatorConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export type McpProxyServerEntry = {
  entryKey: string;
  serverId: number;
  config: TopologyAggregatorConfig;
};

export type TopologyRunStatus = {
  clientId: string;
  running: boolean;
  activeServers: TopologyServerInfo[];
  focusedServerId: number | null;
  aggregator: TopologyAggregatorConfig | null;
  proxyServers?: McpProxyServerEntry[];
  bridgePort: number | null;
  mcpJsonPaths?: string[];
  error?: string;
};

export function startTopology(clientId: string, name: string) {
  return invoke<TopologyRunStatus>("topology_start", { clientId, name });
}

export function stopTopology(clientId: string, name: string) {
  return invoke<boolean>("topology_stop", { clientId, name });
}

export function getTopologyRunStatus(clientId: string, name: string) {
  return invoke<TopologyRunStatus>("topology_get_status", { clientId, name });
}
