import { invoke } from "@tauri-apps/api/core";
import type { AgentRecord } from "../agents/recordsApi";

export type GraphLinkInput = {
  agentId: number;
  mcpServerId: number;
  active: boolean;
  edgeEnabled: boolean;
};

export type GraphServerLink = GraphLinkInput & {
  id: number;
  graphId: number;
  createdAt: string;
  updatedAt: string;
};

export type GraphRecord = {
  id: number;
  clientId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type GraphState = {
  graph: GraphRecord;
  links: GraphServerLink[];
};

export function getGraphState(clientId: string, name: string) {
  return invoke<GraphState>("graph_get_state", { clientId, name });
}

export function saveGraphLinks(clientId: string, name: string, links: GraphLinkInput[]) {
  return invoke<GraphState>("graph_save_links", { clientId, name, links });
}

export function deleteGraph(clientId: string) {
  return invoke<boolean>("graph_delete", { clientId });
}

/** Agents with a verified config directory on disk. */
export function listGraphPlaceableAgents() {
  return invoke<AgentRecord[]>("graph_list_placeable_agents");
}

/** MCP server ids that passed backend handshake. */
export function listGraphPlaceableMcpIds() {
  return invoke<number[]>("graph_list_placeable_mcp_ids");
}
