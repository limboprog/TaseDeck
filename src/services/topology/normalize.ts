import type { Topology, TopologyEdge } from "./types";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Migrate legacy member-level edges to block-level sources. */
export function normalizeTopology(topology: Topology): Topology {
  const blocks = topology.blocks ?? [];
  const nodes = topology.nodes;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const blocksById = new Map(blocks.map((block) => [block.id, block]));

  const edgesToDrop = new Set<string>();
  const edgesToAdd: TopologyEdge[] = [];
  const blockAgentPairs = new Set(
    topology.edges
      .filter((edge) => blocksById.has(edge.sourceId))
      .map((edge) => `${edge.sourceId}:${edge.targetId}`),
  );

  for (const edge of topology.edges) {
    const source = nodeById.get(edge.sourceId);
    if (!source?.blockId || source.type !== "mcp") {
      continue;
    }

    const block = blocksById.get(source.blockId);
    const target = nodeById.get(edge.targetId);
    if (!block || target?.type !== "agent") {
      continue;
    }

    edgesToDrop.add(edge.id);
    const pairKey = `${block.id}:${edge.targetId}`;
    if (blockAgentPairs.has(pairKey)) {
      continue;
    }

    blockAgentPairs.add(pairKey);
    edgesToAdd.push({
      ...edge,
      id: createId(),
      sourceId: block.id,
    });
  }

  if (edgesToDrop.size === 0 && edgesToAdd.length === 0) {
    return { ...topology, blocks };
  }

  return {
    ...topology,
    blocks,
    edges: [
      ...topology.edges.filter((edge) => !edgesToDrop.has(edge.id)),
      ...edgesToAdd,
    ],
  };
}
