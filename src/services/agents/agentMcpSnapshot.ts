const SNAPSHOT_KEY = "tasedeck:agent-mcp-snapshots";
const MODE_KEY = "tasedeck:agent-config-mode";
const USE_DEFAULT_KEY = "tasedeck:agent-use-default";
const TOPOLOGY_KEY = "tasedeck:agent-topology-id";

export type AgentMcpSnapshot = {
  root: Record<string, unknown>;
  capturedAt: string;
};

type SnapshotStore = Record<string, AgentMcpSnapshot>;
type LegacyModeStore = Record<string, "default" | "custom">;
type UseDefaultStore = Record<string, boolean>;
type TopologyStore = Record<string, string>;

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function saveAgentMcpSnapshot(agentId: number, root: Record<string, unknown>) {
  const store = readJson<SnapshotStore>(SNAPSHOT_KEY, {});
  store[String(agentId)] = { root, capturedAt: new Date().toISOString() };
  writeJson(SNAPSHOT_KEY, store);
}

/** Persists the pre-TaseDeck MCP config once; never overwrites an existing snapshot. */
export function saveOriginalMcpSnapshotOnce(agentId: number, root: Record<string, unknown>) {
  if (getAgentMcpSnapshot(agentId)) {
    return;
  }
  saveAgentMcpSnapshot(agentId, root);
}

export function getAgentMcpSnapshot(agentId: number): AgentMcpSnapshot | null {
  const store = readJson<SnapshotStore>(SNAPSHOT_KEY, {});
  return store[String(agentId)] ?? null;
}

export function getUseDefaultConfiguration(agentId: number): boolean {
  const store = readJson<UseDefaultStore>(USE_DEFAULT_KEY, {});
  const key = String(agentId);
  if (key in store) {
    return store[key];
  }
  const legacy = readJson<LegacyModeStore>(MODE_KEY, {});
  return legacy[key] === "default";
}

export function setUseDefaultConfiguration(agentId: number, useDefault: boolean) {
  const store = readJson<UseDefaultStore>(USE_DEFAULT_KEY, {});
  store[String(agentId)] = useDefault;
  writeJson(USE_DEFAULT_KEY, store);
}

export function getAgentTopologyId(agentId: number): string | null {
  const store = readJson<TopologyStore>(TOPOLOGY_KEY, {});
  return store[String(agentId)] ?? null;
}

export function setAgentTopologyId(agentId: number, topologyId: string) {
  const store = readJson<TopologyStore>(TOPOLOGY_KEY, {});
  store[String(agentId)] = topologyId;
  writeJson(TOPOLOGY_KEY, store);
}

export function mcpServersRootKey(kind: string): string {
  if (kind === "cursor" || kind === "vscode" || kind === "windsurf") {
    return "mcpServers";
  }
  if (kind === "opencode") {
    return "mcp";
  }
  return "servers";
}

export const TASEDECK_TOPOLOGY_MCP_KEY = "tasedeck-topology";

export function isTaseDeckTopologyEntry(name: string): boolean {
  return name === TASEDECK_TOPOLOGY_MCP_KEY || name.startsWith("tasedeck-topology-");
}

export const TASEDECK_PROXY_MARKER = "__tasedeckProxy";

export function isTaseDeckProxyEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return false;
  }
  const record = entry as Record<string, unknown>;
  const env = record.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    if (TASEDECK_PROXY_MARKER in (env as Record<string, unknown>)) {
      return true;
    }
  }
  const args = record.args;
  if (Array.isArray(args)) {
    return args.some(
      (value) =>
        typeof value === "string" && value.endsWith("proxy.mjs"),
    );
  }
  return false;
}

export function isTaseDeckManagedEntry(name: string, entry: unknown): boolean {
  return isTaseDeckTopologyEntry(name) || isTaseDeckProxyEntry(entry);
}

export function extractMcpServers(
  root: Record<string, unknown>,
  kind: string,
): Record<string, unknown> {
  const key = mcpServersRootKey(kind);
  const servers = root[key];
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return {};
  }
  return servers as Record<string, unknown>;
}

export function cloneMcpRoot(root: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(root)) as Record<string, unknown>;
}

export function buildDefaultMcpRoot(kind: string): Record<string, unknown> {
  const key = mcpServersRootKey(kind);
  return { [key]: {} };
}

export function stripTaseDeckFromRoot(
  root: Record<string, unknown>,
  kind: string,
): Record<string, unknown> {
  const cleaned = cloneMcpRoot(root);
  const serversKey = mcpServersRootKey(kind);
  const existing = extractMcpServers(cleaned, kind);
  const servers: Record<string, unknown> = {};

  for (const [name, entry] of Object.entries(existing)) {
    if (!isTaseDeckManagedEntry(name, entry)) {
      servers[name] = entry;
    }
  }

  cleaned[serversKey] = servers;
  return cleaned;
}

/** TaseDeck-managed mcp.json: empty until topology play writes per-server proxy entries. */
export function buildCustomMcpRoot(kind: string): Record<string, unknown> {
  return buildDefaultMcpRoot(kind);
}

/** @deprecated Single aggregator entry — replaced by per-server proxy entries on play. */
export function buildLegacyAggregatorMcpRoot(
  kind: string,
  topologyId: string,
  aggregatorScriptPath: string,
): Record<string, unknown> {
  const serversKey = mcpServersRootKey(kind);
  return {
    [serversKey]: {
      [TASEDECK_TOPOLOGY_MCP_KEY]: {
        command: "node",
        args: [aggregatorScriptPath],
        env: {
          TASEDECK_BRIDGE_HOST: "127.0.0.1",
          TASEDECK_BRIDGE_PORT: "0",
          TASEDECK_TOPOLOGY_ID: topologyId,
        },
      },
    },
  };
}

export function formatMcpJsonPreview(root: Record<string, unknown>): string {
  return JSON.stringify(root, null, 2);
}
