export type AgentKind = "cursor" | "claude-code" | "antigravity" | "copilot";

export type TopologyNodeType = "agent" | "mcp";

export type TopologyNode = {
  id: string;
  type: TopologyNodeType;
  name: string;
  x: number;
  y: number;
  agentKind?: AgentKind;
  /** DB `agents.id` — required for server-side graph links. */
  agentRecordId?: number;
  mcpServerId?: number;
  expanded?: boolean;
  blockId?: string;
};

export type TopologyBlock = {
  id: string;
  name: string;
  x: number;
  y: number;
  memberIds: string[];
  collapsed?: boolean;
  /** Per-member run state inside block (default: running). */
  memberRunning?: Record<string, boolean>;
  /** Restored when a block→agent edge is re-enabled. */
  memberRunningSnapshot?: Record<string, boolean>;
};

export type TopologyEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  enabled?: boolean;
};

export type Topology = {
  id: string;
  name: string;
  running: boolean;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  blocks: TopologyBlock[];
  createdAt: string;
  updatedAt: string;
};

export type TopologyDraft = {
  name: string;
};
