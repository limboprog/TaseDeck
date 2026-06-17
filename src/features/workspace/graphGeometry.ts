import type { TopologyBlock, TopologyNode } from "../../services/topology";
import {
  BLOCK_CONTENT_WIDTH,
  BLOCK_MEMBER_HEIGHT,
  getBlockOutlet,
  getBlockRect,
} from "./blockLayout";
import { GRAPH_SERVER_ROW_HEIGHT, NODE_WIDTH } from "./graphLayoutConstants";
import { getNodeHeight } from "./GraphNode";

export type Point = { x: number; y: number };
export type NodeSide = "top" | "bottom" | "left" | "right";

export type EdgeAnchors = {
  from: Point;
  to: Point;
  fromSide: NodeSide;
  toSide: NodeSide;
};

function getBezierPoints(anchors: EdgeAnchors) {
  const { from, to, fromSide, toSide } = anchors;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const offset = Math.min(110, Math.max(44, distance * 0.42));
  return {
    p0: from,
    p1: controlFromSide(from, fromSide, offset),
    p2: controlFromSide(to, toSide, offset),
    p3: to,
  };
}

/** Connection box — header only; dropdown must not shift edge anchors. */
export function getNodeRect(node: TopologyNode) {
  return {
    x: node.x,
    y: node.y,
    width: NODE_WIDTH,
    height: GRAPH_SERVER_ROW_HEIGHT,
  };
}

function getSideAnchor(
  rect: { x: number; y: number; width: number; height: number },
  side: NodeSide,
): Point {
  switch (side) {
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

function pickFacingSide(
  rect: { x: number; y: number; width: number; height: number },
  target: Point,
): NodeSide {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }
  return dy > 0 ? "bottom" : "top";
}

function controlFromSide(point: Point, side: NodeSide, offset: number): Point {
  switch (side) {
    case "top":
      return { x: point.x, y: point.y - offset };
    case "bottom":
      return { x: point.x, y: point.y + offset };
    case "left":
      return { x: point.x - offset, y: point.y };
    case "right":
      return { x: point.x + offset, y: point.y };
  }
}

export function buildEdgePath(anchors: EdgeAnchors): string {
  const { from, to, fromSide, toSide } = anchors;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const offset = Math.min(110, Math.max(44, distance * 0.42));
  const c1 = controlFromSide(from, fromSide, offset);
  const c2 = controlFromSide(to, toSide, offset);
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

export function getCubicMidpoint(anchors: EdgeAnchors): Point {
  const { p0, p1, p2, p3 } = getBezierPoints(anchors);
  const t = 0.5;
  const mt = 1 - t;

  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  };
}

export function getCubicTangentAngle(anchors: EdgeAnchors, t = 0.5): number {
  const { p0, p1, p2, p3 } = getBezierPoints(anchors);
  const mt = 1 - t;
  const dx =
    3 * mt * mt * (p1.x - p0.x) +
    6 * mt * t * (p2.x - p1.x) +
    3 * t * t * (p3.x - p2.x);
  const dy =
    3 * mt * mt * (p1.y - p0.y) +
    6 * mt * t * (p2.y - p1.y) +
    3 * t * t * (p3.y - p2.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function getMcpSourceAnchor(
  mcpNode: TopologyNode,
  targetCenter: Point,
  blocksById: Map<string, TopologyBlock>,
): { from: Point; fromSide: NodeSide } {
  if (!mcpNode.blockId) {
    const sourceRect = getNodeRect(mcpNode);
    const fromSide = pickFacingSide(sourceRect, targetCenter);
    return { from: getSideAnchor(sourceRect, fromSide), fromSide };
  }

  const block = blocksById.get(mcpNode.blockId);
  if (!block) {
    const sourceRect = getNodeRect(mcpNode);
    const fromSide = pickFacingSide(sourceRect, targetCenter);
    return { from: getSideAnchor(sourceRect, fromSide), fromSide };
  }

  const memberCount = block.memberIds.length;
  const outlet = getBlockOutlet(block, memberCount);
  return { from: outlet, fromSide: "right" };
}

function getMcpAnchorFromSourceId(
  sourceId: string,
  targetCenter: Point,
  nodes: TopologyNode[],
  blocksById: Map<string, TopologyBlock>,
): { from: Point; fromSide: NodeSide } | null {
  const block = blocksById.get(sourceId);
  if (block) {
    const outlet = getBlockOutlet(block, block.memberIds.length);
    return { from: outlet, fromSide: "right" };
  }

  const source = nodes.find((node) => node.id === sourceId);
  if (!source || source.type !== "mcp" || source.blockId) {
    return null;
  }

  return getMcpSourceAnchor(source, targetCenter, blocksById);
}

export function getEdgeAnchorsForEndpoints(
  sourceId: string,
  target: TopologyNode,
  nodes: TopologyNode[],
  blocksById: Map<string, TopologyBlock>,
): EdgeAnchors | null {
  const targetRect = getNodeRect(target);
  const targetCenter = {
    x: targetRect.x + targetRect.width / 2,
    y: targetRect.y + targetRect.height / 2,
  };

  const block = blocksById.get(sourceId);
  const sourceCenter = block
    ? getBlockOutlet(block, block.memberIds.length)
    : (() => {
        const source = nodes.find((node) => node.id === sourceId);
        if (!source) {
          return targetCenter;
        }
        const sourceRect = getNodeRect(source);
        return {
          x: sourceRect.x + sourceRect.width / 2,
          y: sourceRect.y + sourceRect.height / 2,
        };
      })();

  const mcpAnchor = getMcpAnchorFromSourceId(sourceId, targetCenter, nodes, blocksById);
  if (!mcpAnchor) {
    return null;
  }

  const toSide = pickFacingSide(targetRect, sourceCenter);

  return {
    from: mcpAnchor.from,
    to: getSideAnchor(targetRect, toSide),
    fromSide: mcpAnchor.fromSide,
    toSide,
  };
}

export function getWireAnchorsForSource(
  sourceId: string,
  cursor: Point,
  nodes: TopologyNode[],
  blocksById: Map<string, TopologyBlock>,
): EdgeAnchors | null {
  const mcpAnchor = getMcpAnchorFromSourceId(sourceId, cursor, nodes, blocksById);
  if (!mcpAnchor) {
    return null;
  }

  const { from, fromSide } = mcpAnchor;
  return {
    from,
    to: cursor,
    fromSide,
    toSide: pickFacingSide(
      {
        x: cursor.x - 1,
        y: cursor.y - 1,
        width: 2,
        height: 2,
      },
      from,
    ),
  };
}

function hitTestBlock(
  blocks: TopologyBlock[],
  point: Point,
): string | null {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    const memberCount = block.memberIds.length;
    const rect = getBlockRect(block, memberCount);
    if (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    ) {
      return block.id;
    }
  }
  return null;
}

export function hitTestNode(
  nodes: TopologyNode[],
  point: Point,
  linkedCountByNode: Map<string, number>,
  ignoreNodeId?: string | null,
): string | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (ignoreNodeId && node.id === ignoreNodeId) {
      continue;
    }
    if (node.blockId) {
      continue;
    }
    const height = getNodeHeight(node, linkedCountByNode.get(node.id) ?? 0);
    if (
      point.x >= node.x &&
      point.x <= node.x + NODE_WIDTH &&
      point.y >= node.y &&
      point.y <= node.y + height
    ) {
      return node.id;
    }
  }
  return null;
}

export function hitTestBlockMember(
  blocks: TopologyBlock[],
  nodes: TopologyNode[],
  point: Point,
  ignoreNodeId?: string | null,
): string | null {
  for (const block of blocks) {
    if (block.collapsed) {
      continue;
    }
    for (const memberId of block.memberIds) {
      if (ignoreNodeId && memberId === ignoreNodeId) {
        continue;
      }
      const node = nodes.find((entry) => entry.id === memberId);
      if (!node) {
        continue;
      }
      if (
        point.x >= node.x &&
        point.x <= node.x + BLOCK_CONTENT_WIDTH &&
        point.y >= node.y &&
        point.y <= node.y + BLOCK_MEMBER_HEIGHT
      ) {
        return node.id;
      }
    }
  }
  return null;
}

/** Wire / click targets: loose nodes and blocks — not block members. */
export function hitTestWireTarget(
  nodes: TopologyNode[],
  blocks: TopologyBlock[],
  point: Point,
  linkedCountByNode: Map<string, number>,
  ignoreId?: string | null,
): string | null {
  const nodeHit = hitTestNode(nodes, point, linkedCountByNode, ignoreId);
  if (nodeHit) {
    return nodeHit;
  }

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (ignoreId && block.id === ignoreId) {
      continue;
    }
    const memberCount = block.memberIds.length;
    const rect = getBlockRect(block, memberCount);
    if (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    ) {
      return block.id;
    }
  }

  return null;
}

export { hitTestBlock };

export function getCanvasPoint(
  event: PointerEvent,
  canvas: HTMLDivElement,
  pan: Point,
  zoom: number,
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - pan.x) / zoom,
    y: (event.clientY - rect.top - pan.y) / zoom,
  };
}

export function worldToScreen(point: Point, pan: Point, zoom: number): Point {
  return {
    x: pan.x + point.x * zoom,
    y: pan.y + point.y * zoom,
  };
}
