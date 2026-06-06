import type { GraphLinkInput, GraphServerLink } from "./graphApi";
import type { TopologyBlock, TopologyEdge, TopologyNode } from "./types";

export function resolveAgentRecordId(
  node: TopologyNode,
  defaultAgentRecordId?: number,
): number | undefined {
  if (node.type !== "agent") {
    return undefined;
  }
  if (node.agentRecordId !== undefined) {
    return node.agentRecordId;
  }
  return defaultAgentRecordId;
}

export function buildLinkInputs(
  nodes: TopologyNode[],
  blocks: TopologyBlock[],
  edges: TopologyEdge[],
  defaultAgentRecordId?: number,
): GraphLinkInput[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const inputs: GraphLinkInput[] = [];

  for (const edge of edges) {
    const target = nodeById.get(edge.targetId);
    const agentId =
      target && target.type === "agent"
        ? resolveAgentRecordId(target, defaultAgentRecordId)
        : undefined;
    if (!agentId) {
      continue;
    }

    const edgeEnabled = edge.enabled !== false;
    const block = blocksById.get(edge.sourceId);

    if (block) {
      for (const memberId of block.memberIds) {
        const member = nodeById.get(memberId);
        if (!member?.mcpServerId) {
          continue;
        }
        inputs.push({
          agentId,
          mcpServerId: member.mcpServerId,
          active: edgeEnabled ? block.memberRunning?.[memberId] !== false : false,
          edgeEnabled,
        });
      }
      continue;
    }

    const source = nodeById.get(edge.sourceId);
    if (source?.type === "mcp" && !source.blockId && source.mcpServerId) {
      inputs.push({
        agentId,
        mcpServerId: source.mcpServerId,
        active: edgeEnabled,
        edgeEnabled,
      });
    }
  }

  return inputs;
}

export function applyServerLinksToTopology(
  nodes: TopologyNode[],
  blocks: TopologyBlock[],
  links: GraphServerLink[],
  defaultAgentRecordId?: number,
): { edges: TopologyEdge[]; blocks: TopologyBlock[] } {
  const edges: TopologyEdge[] = [];
  const nextBlocks = blocks.map((block) => ({
    ...block,
    memberRunning: { ...block.memberRunning },
  }));

  const agentNodes = nodes.filter(
    (node) => node.type === "agent" && resolveAgentRecordId(node, defaultAgentRecordId) !== undefined,
  );

  for (const agentNode of agentNodes) {
    const agentRecordId = resolveAgentRecordId(agentNode, defaultAgentRecordId)!;
    const agentLinks = links.filter((link) => link.agentId === agentRecordId);
    if (agentLinks.length === 0) {
      continue;
    }

    const linkByMcpId = new Map(agentLinks.map((link) => [link.mcpServerId, link]));

    for (const block of nextBlocks) {
      const memberNodes = block.memberIds
        .map((memberId) => nodes.find((node) => node.id === memberId))
        .filter((node): node is TopologyNode => Boolean(node));

      if (memberNodes.length === 0) {
        continue;
      }

      const memberLinks = memberNodes
        .map((node) => (node.mcpServerId ? linkByMcpId.get(node.mcpServerId) : undefined))
        .filter((link): link is GraphServerLink => Boolean(link));

      const allMembersLinked =
        memberNodes.length === block.memberIds.length &&
        memberLinks.length === block.memberIds.length;

      if (!allMembersLinked) {
        continue;
      }

      const edgeEnabled = memberLinks.every((link) => link.edgeEnabled);
      edges.push({
        id: `srv-block-${block.id}-${agentNode.id}`,
        sourceId: block.id,
        targetId: agentNode.id,
        enabled: edgeEnabled,
      });

      for (const member of memberNodes) {
        if (!member.mcpServerId) {
          continue;
        }
        const link = linkByMcpId.get(member.mcpServerId);
        if (!link) {
          continue;
        }
        block.memberRunning[member.id] = link.active;
        linkByMcpId.delete(member.mcpServerId);
      }
    }

    for (const [mcpServerId, link] of linkByMcpId) {
      const mcpNode = nodes.find(
        (node) =>
          node.type === "mcp" &&
          !node.blockId &&
          node.mcpServerId === mcpServerId,
      );
      if (!mcpNode) {
        continue;
      }
      edges.push({
        id: `srv-${link.id}`,
        sourceId: mcpNode.id,
        targetId: agentNode.id,
        enabled: link.edgeEnabled,
      });
    }
  }

  return { edges, blocks: nextBlocks };
}
