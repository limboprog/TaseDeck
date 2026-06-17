import type { TopologyBlock, TopologyEdge, TopologyNode } from "../../services/topology";

export type EndpointRole = "mcp" | "agent";

export function isMcpNodeActive(node: TopologyNode) {
  return node.mcpActive !== false;
}

export function isNodeGraphReady(
  node: TopologyNode,
  placeableAgentIds: ReadonlySet<number>,
  placeableMcpIds: ReadonlySet<number>,
) {
  if (node.type === "agent") {
    return (
      node.agentRecordId !== undefined && placeableAgentIds.has(node.agentRecordId)
    );
  }
  return node.mcpServerId !== undefined && placeableMcpIds.has(node.mcpServerId);
}

export function isBlockConfigured(
  block: TopologyBlock,
  nodeById: Map<string, TopologyNode>,
  placeableMcpIds: ReadonlySet<number>,
) {
  if (block.memberIds.length === 0) {
    return false;
  }
  return block.memberIds.every((memberId) => {
    const member = nodeById.get(memberId);
    return (
      member?.type === "mcp" &&
      isNodeGraphReady(member, new Set(), placeableMcpIds)
    );
  });
}

export function getEndpointRole(
  id: string,
  nodeById: Map<string, TopologyNode>,
  blocksById: Map<string, TopologyBlock>,
  placeableAgentIds: ReadonlySet<number>,
  placeableMcpIds: ReadonlySet<number>,
): EndpointRole | null {
  const block = blocksById.get(id);
  if (block) {
    return isBlockConfigured(block, nodeById, placeableMcpIds) ? "mcp" : null;
  }

  const node = nodeById.get(id);
  if (!node || node.blockId) {
    return null;
  }

  if (!isNodeGraphReady(node, placeableAgentIds, placeableMcpIds)) {
    return null;
  }

  return node.type === "mcp" ? "mcp" : node.type === "agent" ? "agent" : null;
}

export function isValidConnection(
  sourceId: string,
  targetId: string,
  nodeById: Map<string, TopologyNode>,
  blocksById: Map<string, TopologyBlock>,
  placeableAgentIds: ReadonlySet<number>,
  placeableMcpIds: ReadonlySet<number>,
) {
  if (sourceId === targetId) {
    return false;
  }

  const sourceRole = getEndpointRole(
    sourceId,
    nodeById,
    blocksById,
    placeableAgentIds,
    placeableMcpIds,
  );
  const targetRole = getEndpointRole(
    targetId,
    nodeById,
    blocksById,
    placeableAgentIds,
    placeableMcpIds,
  );
  return (
    (sourceRole === "mcp" && targetRole === "agent") ||
    (sourceRole === "agent" && targetRole === "mcp")
  );
}

export function normalizeEdgeEndpoints(
  sourceId: string,
  targetId: string,
  nodeById: Map<string, TopologyNode>,
  blocksById: Map<string, TopologyBlock>,
  placeableAgentIds: ReadonlySet<number>,
  placeableMcpIds: ReadonlySet<number>,
) {
  const sourceRole = getEndpointRole(
    sourceId,
    nodeById,
    blocksById,
    placeableAgentIds,
    placeableMcpIds,
  );
  const targetRole = getEndpointRole(
    targetId,
    nodeById,
    blocksById,
    placeableAgentIds,
    placeableMcpIds,
  );

  if (sourceRole === "mcp" && targetRole === "agent") {
    return { sourceId, targetId };
  }
  if (sourceRole === "agent" && targetRole === "mcp") {
    return { sourceId: targetId, targetId: sourceId };
  }
  return null;
}

export function memberHadAgentLink(
  memberId: string,
  edges: TopologyEdge[],
  nodeById: Map<string, TopologyNode>,
  blocksById: Map<string, TopologyBlock>,
  nodes: TopologyNode[],
  placeableAgentIds: ReadonlySet<number>,
  placeableMcpIds: ReadonlySet<number>,
) {
  for (const edge of edges) {
    if (edge.enabled === false) {
      continue;
    }

    const sourceNode = nodeById.get(edge.sourceId);
    const targetNode = nodeById.get(edge.targetId);
    const sourceBlock = blocksById.get(edge.sourceId);

    if (
      edge.sourceId === memberId &&
      targetNode &&
      isNodeGraphReady(targetNode, placeableAgentIds, placeableMcpIds) &&
      targetNode.type === "agent"
    ) {
      return true;
    }
    if (
      edge.targetId === memberId &&
      sourceNode &&
      isNodeGraphReady(sourceNode, placeableAgentIds, placeableMcpIds) &&
      sourceNode.type === "agent"
    ) {
      return true;
    }

    const member = nodes.find((node) => node.id === memberId);
    if (
      member?.blockId &&
      sourceBlock?.id === member.blockId &&
      targetNode &&
      isNodeGraphReady(targetNode, placeableAgentIds, placeableMcpIds) &&
      targetNode.type === "agent"
    ) {
      return true;
    }
  }

  return false;
}

export function buildMemberRunningFromEdges(
  memberIds: string[],
  edges: TopologyEdge[],
  nodeById: Map<string, TopologyNode>,
  blocksById: Map<string, TopologyBlock>,
  nodes: TopologyNode[],
  placeableAgentIds: ReadonlySet<number>,
  placeableMcpIds: ReadonlySet<number>,
): Record<string, boolean> {
  const memberRunning: Record<string, boolean> = {};
  for (const memberId of memberIds) {
    memberRunning[memberId] = memberHadAgentLink(
      memberId,
      edges,
      nodeById,
      blocksById,
      nodes,
      placeableAgentIds,
      placeableMcpIds,
    );
  }
  return memberRunning;
}

export function snapshotMemberRunning(
  block: TopologyBlock,
): Record<string, boolean> {
  const snapshot: Record<string, boolean> = {};
  for (const memberId of block.memberIds) {
    snapshot[memberId] = block.memberRunning?.[memberId] !== false;
  }
  return snapshot;
}

export function applyStandaloneMcpEdgeEnabled(
  nodes: TopologyNode[],
  mcpNodeId: string,
  enabled: boolean,
): TopologyNode[] {
  return nodes.map((node) => {
    if (node.id !== mcpNodeId || node.type !== "mcp" || node.blockId) {
      return node;
    }

    if (!enabled) {
      return {
        ...node,
        mcpActiveSnapshot: isMcpNodeActive(node),
        mcpActive: false,
      };
    }

    if (node.mcpActiveSnapshot === undefined) {
      return node;
    }

    return {
      ...node,
      mcpActive: node.mcpActiveSnapshot !== false,
      mcpActiveSnapshot: undefined,
    };
  });
}

export function applyBlockEdgeEnabled(
  blocks: TopologyBlock[],
  blockId: string,
  enabled: boolean,
): TopologyBlock[] {
  return blocks.map((block) => {
    if (block.id !== blockId) {
      return block;
    }

    if (!enabled) {
      return {
        ...block,
        memberRunningSnapshot: snapshotMemberRunning(block),
        memberRunning: Object.fromEntries(
          block.memberIds.map((memberId) => [memberId, false]),
        ),
      };
    }

    const snapshot = block.memberRunningSnapshot;
    if (!snapshot) {
      return block;
    }

    const memberRunning: Record<string, boolean> = { ...block.memberRunning };
    for (const memberId of block.memberIds) {
      memberRunning[memberId] = snapshot[memberId] !== false;
    }

    return {
      ...block,
      memberRunning,
      memberRunningSnapshot: undefined,
    };
  });
}
