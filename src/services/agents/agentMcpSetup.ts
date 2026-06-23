import { createManualMcpDraft } from "../../features/mcp/createManualMcpDraft";
import { addInstalledMcpServer, listInstalledMcpServers } from "../mcp_installed/api";
import type { InstalledMcpServer } from "../mcp_installed/types";
import { buildLinkInputs } from "../topology/graphState";
import { saveGraphLinks } from "../topology/graphApi";
import {
  createId,
  createTopology,
  getStoredTopologies,
  saveTopologies,
} from "../topology/storage";
import type { Topology, TopologyEdge, TopologyNode } from "../topology/types";
import {
  buildCustomMcpRoot,
  buildDefaultMcpRoot,
  cloneMcpRoot,
  extractMcpServers,
  getAgentMcpSnapshot,
  getAgentTopologyId,
  isTaseDeckManagedEntry,
  saveOriginalMcpSnapshotOnce,
  setAgentTopologyId,
  stripTaseDeckFromRoot,
} from "./agentMcpSnapshot";
import {
  readAgentRecordMcpJson,
  writeAgentRecordMcpJson,
  type AgentRecord,
} from "./recordsApi";

function serverDraftFromMcpEntry(
  name: string,
  entry: Record<string, unknown>,
): InstalledMcpServer {
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  const isRemote = Boolean(url);
  const command = typeof entry.command === "string" ? entry.command.trim() : "";
  const args = Array.isArray(entry.args)
    ? entry.args.filter((value): value is string => typeof value === "string")
    : [];
  const runCommand = isRemote ? url : [command, ...args].filter(Boolean).join(" ");

  return {
    ...createManualMcpDraft(),
    name,
    type: isRemote ? "remote" : "local",
    runCommand,
    jsonConfig: JSON.stringify(entry),
  };
}

function snapshotHasMcpServers(snapshot: Record<string, unknown>, kind: string): boolean {
  const servers = extractMcpServers(snapshot, kind);
  return Object.keys(servers).some((name) => {
    const entry = servers[name];
    return !isTaseDeckManagedEntry(name, entry);
  });
}

export async function ensureAgentMcpSnapshot(agent: AgentRecord) {
  const existing = getAgentMcpSnapshot(agent.id);
  if (existing) {
    return existing.root;
  }

  const current = await readAgentRecordMcpJson(agent.id);
  const raw = current ?? buildDefaultMcpRoot(agent.kind);
  const original = stripTaseDeckFromRoot(raw, agent.kind);
  saveOriginalMcpSnapshotOnce(agent.id, original);
  return original;
}

async function installSnapshotServers(
  agent: AgentRecord,
  snapshot: Record<string, unknown>,
): Promise<InstalledMcpServer[]> {
  const servers = extractMcpServers(snapshot, agent.kind);
  const installed = await listInstalledMcpServers();
  const byName = new Map(installed.map((server) => [server.name.trim().toLowerCase(), server]));
  const result: InstalledMcpServer[] = [];
  const seen = new Set<string>();

  for (const [name, entry] of Object.entries(servers)) {
    if (isTaseDeckManagedEntry(name, entry)) {
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const normalized = name.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    const existing = byName.get(normalized);
    if (existing) {
      result.push(existing);
      continue;
    }

    const created = await addInstalledMcpServer(
      serverDraftFromMcpEntry(name, entry as Record<string, unknown>),
    );
    byName.set(normalized, created);
    result.push(created);
  }

  return result;
}

function buildAgentTopologyGraph(
  agent: AgentRecord,
  servers: InstalledMcpServer[],
): Pick<Topology, "nodes" | "edges"> {
  const agentNodeId = createId();
  const agentNode: TopologyNode = {
    id: agentNodeId,
    type: "agent",
    name: agent.name,
    agentKind: agent.kind,
    agentRecordId: agent.id,
    x: 400,
    y: 200,
    expanded: false,
  };

  const nodes: TopologyNode[] = [agentNode];
  const edges: TopologyEdge[] = [];

  servers.forEach((server, index) => {
    const mcpNodeId = createId();
    nodes.push({
      id: mcpNodeId,
      type: "mcp",
      name: server.name,
      mcpServerId: server.id,
      x: 120,
      y: 80 + index * 90,
      expanded: false,
      mcpActive: true,
    });
    edges.push({
      id: createId(),
      sourceId: mcpNodeId,
      targetId: agentNodeId,
      enabled: true,
    });
  });

  return { nodes, edges };
}

async function persistTopologyGraphLinks(
  agent: AgentRecord,
  topology: Topology,
): Promise<void> {
  const links = buildLinkInputs(topology.nodes, topology.blocks, topology.edges, agent.id);
  await saveGraphLinks(topology.id, topology.name, links);
}

async function syncAgentTopologyServers(
  agent: AgentRecord,
  topology: Topology,
  servers: InstalledMcpServer[],
): Promise<Topology> {
  const agentNode =
    topology.nodes.find((node) => node.type === "agent" && node.agentRecordId === agent.id) ??
    topology.nodes.find((node) => node.type === "agent");

  if (!agentNode) {
    const graph = buildAgentTopologyGraph(agent, servers);
    const updated: Topology = {
      ...topology,
      ...graph,
      updatedAt: new Date().toISOString(),
    };
    const stored = getStoredTopologies();
    saveTopologies(stored.map((entry) => (entry.id === topology.id ? updated : entry)));
    await persistTopologyGraphLinks(agent, updated);
    return updated;
  }

  const linkedMcpIds = new Set(
    topology.nodes
      .filter((node) => node.type === "mcp" && node.mcpServerId !== undefined)
      .map((node) => node.mcpServerId!),
  );

  const nodes = [...topology.nodes];
  const edges = [...topology.edges];
  let mcpCount = topology.nodes.filter((node) => node.type === "mcp").length;

  for (const server of servers) {
    if (linkedMcpIds.has(server.id)) {
      continue;
    }
    const mcpNodeId = createId();
    nodes.push({
      id: mcpNodeId,
      type: "mcp",
      name: server.name,
      mcpServerId: server.id,
      x: 120,
      y: 80 + mcpCount * 90,
      expanded: false,
      mcpActive: true,
    });
    edges.push({
      id: createId(),
      sourceId: mcpNodeId,
      targetId: agentNode.id,
      enabled: true,
    });
    mcpCount += 1;
  }

  const updated: Topology = {
    ...topology,
    nodes,
    edges,
    updatedAt: new Date().toISOString(),
  };
  const stored = getStoredTopologies();
  saveTopologies(stored.map((entry) => (entry.id === topology.id ? updated : entry)));
  await persistTopologyGraphLinks(agent, updated);
  return updated;
}

async function ensureAgentTopology(
  agent: AgentRecord,
  servers: InstalledMcpServer[],
): Promise<string> {
  if (servers.length === 0) {
    throw new Error("Cannot create topology without MCP servers.");
  }

  const existingId = getAgentTopologyId(agent.id);
  const stored = getStoredTopologies();

  if (existingId) {
    const existing = stored.find((topology) => topology.id === existingId);
    if (existing) {
      await syncAgentTopologyServers(agent, existing, servers);
      return existingId;
    }
  }

  const topology = createTopology(agent.name);
  const graph = buildAgentTopologyGraph(agent, servers);
  const fullTopology: Topology = {
    ...topology,
    ...graph,
    updatedAt: new Date().toISOString(),
  };

  saveTopologies([fullTopology, ...stored]);
  setAgentTopologyId(agent.id, topology.id);
  await persistTopologyGraphLinks(agent, fullTopology);

  return topology.id;
}

/** Installs MCP servers from the saved snapshot and creates a topology named after the agent. */
export async function bootstrapAgentMcpResources(agent: AgentRecord): Promise<void> {
  const original = await ensureAgentMcpSnapshot(agent);
  if (!snapshotHasMcpServers(original, agent.kind)) {
    return;
  }

  const installed = await installSnapshotServers(agent, original);
  if (installed.length === 0) {
    return;
  }

  await ensureAgentTopology(agent, installed);
}

/** Writes agent mcp.json from the saved original snapshot (custom or default). */
export async function applyUseDefaultConfiguration(
  agent: AgentRecord,
  useDefault: boolean,
): Promise<Record<string, unknown>> {
  const original = await ensureAgentMcpSnapshot(agent);

  if (useDefault) {
    const restored = cloneMcpRoot(original);
    await writeAgentRecordMcpJson(agent.id, restored);
    return restored;
  }

  const installed = await installSnapshotServers(agent, original);
  let topologyId = getAgentTopologyId(agent.id) ?? "";

  if (installed.length > 0) {
    topologyId = await ensureAgentTopology(agent, installed);
  } else if (!topologyId) {
    throw new Error("No MCP servers in the default configuration to build a TaseDeck topology.");
  }

  const customRoot = buildCustomMcpRoot(agent.kind);
  await writeAgentRecordMcpJson(agent.id, customRoot);
  return customRoot;
}
