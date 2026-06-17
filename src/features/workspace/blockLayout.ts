import { createId } from "../../services/topology";
import type { TopologyBlock, TopologyEdge, TopologyNode } from "../../services/topology";
import { buildMemberRunningFromEdges } from "./graphConnections";
import {
  BLOCK_CONTENT_WIDTH,
  BLOCK_MEMBER_GAP,
  BLOCK_MEMBER_HEIGHT,
  BLOCK_NAME_HEIGHT,
  BLOCK_OUTER_WIDTH,
  BLOCK_PADDING,
  NODE_HEADER_HEIGHT,
  NODE_WIDTH,
} from "./graphLayoutConstants";

export {
  BLOCK_CONTENT_WIDTH,
  BLOCK_MEMBER_GAP,
  BLOCK_MEMBER_HEIGHT,
  BLOCK_NAME_HEIGHT,
  BLOCK_OUTER_WIDTH,
  BLOCK_PADDING,
} from "./graphLayoutConstants";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isMemberRunning(block: TopologyBlock, memberId: string) {
  return block.memberRunning?.[memberId] !== false;
}

export function getBlockWidth() {
  return BLOCK_OUTER_WIDTH;
}

export function getBlockHeight(collapsed: boolean, memberCount: number) {
  if (collapsed) {
    return BLOCK_NAME_HEIGHT;
  }
  if (memberCount === 0) {
    return BLOCK_NAME_HEIGHT + BLOCK_PADDING;
  }
  return (
    BLOCK_NAME_HEIGHT +
    BLOCK_PADDING +
    memberCount * BLOCK_MEMBER_HEIGHT +
    Math.max(0, memberCount - 1) * BLOCK_MEMBER_GAP +
    BLOCK_PADDING
  );
}

export function getBlockRect(block: TopologyBlock, memberCount: number): Rect {
  return {
    x: block.x,
    y: block.y,
    width: getBlockWidth(),
    height: getBlockHeight(Boolean(block.collapsed), memberCount),
  };
}

export function getBlockOutlet(block: TopologyBlock, memberCount: number) {
  const rect = getBlockRect(block, memberCount);
  return {
    x: rect.x + rect.width,
    y: rect.y + rect.height / 2,
  };
}

export function getMemberRowRect(block: TopologyBlock, memberIndex: number): Rect {
  const y =
    block.y +
    BLOCK_NAME_HEIGHT +
    BLOCK_PADDING +
    memberIndex * (BLOCK_MEMBER_HEIGHT + BLOCK_MEMBER_GAP);
  return {
    x: block.x + BLOCK_PADDING,
    y,
    width: BLOCK_CONTENT_WIDTH,
    height: BLOCK_MEMBER_HEIGHT,
  };
}

export function layoutMembersInBlock(
  block: TopologyBlock,
  nodes: TopologyNode[],
): TopologyNode[] {
  const memberX = block.x + BLOCK_PADDING;
  const memberY = block.y + BLOCK_NAME_HEIGHT + BLOCK_PADDING;

  return nodes.map((node) => {
    if (node.blockId !== block.id) {
      return node;
    }
    const index = block.memberIds.indexOf(node.id);
    if (index < 0) {
      return node;
    }
    return {
      ...node,
      x: memberX,
      y: memberY + index * (BLOCK_MEMBER_HEIGHT + BLOCK_MEMBER_GAP),
    };
  });
}

export function moveBlock(
  block: TopologyBlock,
  nodes: TopologyNode[],
  nextX: number,
  nextY: number,
): { block: TopologyBlock; nodes: TopologyNode[] } {
  const dx = nextX - block.x;
  const dy = nextY - block.y;
  const movedBlock = { ...block, x: nextX, y: nextY };
  const movedNodes = nodes.map((node) =>
    node.blockId === block.id ? { ...node, x: node.x + dx, y: node.y + dy } : node,
  );
  return { block: movedBlock, nodes: movedNodes };
}

export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function rectsIntersect(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function getLooseMcpRect(node: TopologyNode): Rect {
  return {
    x: node.x,
    y: node.y,
    width: NODE_WIDTH,
    height: NODE_HEADER_HEIGHT,
  };
}

export function mergeMcpsIntoSingleBlock(
  mcpIds: string[],
  blocks: TopologyBlock[],
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  placeableAgentIds: ReadonlySet<number> = new Set(),
  placeableMcpIds: ReadonlySet<number> = new Set(),
): {
  blocks: TopologyBlock[];
  nodes: TopologyNode[];
  edges: TopologyEdge[];
} | null {
  const uniqueMemberIds = [...new Set(mcpIds)];
  if (uniqueMemberIds.length < 2) {
    return null;
  }

  const members = uniqueMemberIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is TopologyNode => node !== undefined && node.type === "mcp");

  if (members.length < 2) {
    return null;
  }

  const blocksToRemove = new Set(
    blocks
      .filter((block) => block.memberIds.some((memberId) => uniqueMemberIds.includes(memberId)))
      .map((block) => block.id),
  );

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const blocksById = new Map(blocks.map((block) => [block.id, block]));

  const agentTargets = new Set<string>();
  const remainingEdges = edges.filter((edge) => {
    if (blocksToRemove.has(edge.sourceId)) {
      const target = nodeById.get(edge.targetId);
      if (target?.type === "agent") {
        agentTargets.add(target.id);
      }
      return false;
    }

    if (uniqueMemberIds.includes(edge.sourceId)) {
      const target = nodeById.get(edge.targetId);
      if (target?.type === "agent") {
        agentTargets.add(target.id);
      }
      return false;
    }

    if (uniqueMemberIds.includes(edge.targetId)) {
      const source = nodeById.get(edge.sourceId);
      if (source?.type === "agent") {
        agentTargets.add(source.id);
      }
      return false;
    }

    return true;
  });

  const memberRunning = buildMemberRunningFromEdges(
    members.map((member) => member.id),
    edges,
    nodeById,
    blocksById,
    nodes,
    placeableAgentIds,
    placeableMcpIds,
  );

  const newBlock: TopologyBlock = {
    id: createId(),
    name: "Block",
    x: Math.min(...members.map((member) => member.x)) - 16,
    y: Math.min(...members.map((member) => member.y)) - BLOCK_NAME_HEIGHT - 12,
    memberIds: members.map((member) => member.id),
    collapsed: false,
    memberRunning,
  };

  const remainingBlocks = blocks.filter((block) => !blocksToRemove.has(block.id));
  const nodesWithBlock = layoutMembersInBlock(
    newBlock,
    nodes.map((node) => {
      if (uniqueMemberIds.includes(node.id)) {
        return { ...node, blockId: newBlock.id };
      }
      if (node.blockId && blocksToRemove.has(node.blockId)) {
        return { ...node, blockId: undefined };
      }
      return node;
    }),
  );

  const existingBlockAgents = new Set(
    remainingEdges
      .filter((edge) => edge.sourceId === newBlock.id)
      .map((edge) => edge.targetId),
  );

  const blockEdges: TopologyEdge[] = [...agentTargets]
    .filter((agentId) => !existingBlockAgents.has(agentId))
    .map((agentId) => ({
      id: createId(),
      sourceId: newBlock.id,
      targetId: agentId,
      enabled: true,
    }));

  return {
    blocks: [...remainingBlocks, newBlock],
    nodes: nodesWithBlock,
    edges: [...remainingEdges, ...blockEdges],
  };
}

export function collectMcpsFromSelectionRect(
  selection: Rect,
  blocks: TopologyBlock[],
  nodes: TopologyNode[],
) {
  const mcpIds = new Set<string>();

  for (const node of nodes) {
    if (node.type !== "mcp" || node.blockId) {
      continue;
    }
    if (rectsIntersect(selection, getLooseMcpRect(node))) {
      mcpIds.add(node.id);
    }
  }

  for (const block of blocks) {
    const blockRect = getBlockRect(block, block.memberIds.length);
    if (!rectsIntersect(selection, blockRect)) {
      continue;
    }
    for (const memberId of block.memberIds) {
      mcpIds.add(memberId);
    }
  }

  return [...mcpIds];
}
