export type VerticalTreeNode = {
  /** Circle center offset from the top of the rail (px). */
  offsetY: number;
};

export type VerticalTreeCircleNode = {
  offsetY: number;
  active?: boolean;
};

export type VerticalTreeSegment = {
  y1: number;
  y2: number;
  dashed?: boolean;
};

export function buildVerticalTreeSegments(
  trunkNodes: VerticalTreeNode[],
  circleRadius: number,
  options?: {
    lineExtendToY?: number;
    /** Inclusive trunk span (sorted order) rendered as a dashed line. */
    dashedSpan?: { fromIndex: number; toIndex: number };
  },
): VerticalTreeSegment[] {
  if (trunkNodes.length === 0) {
    return [];
  }

  const sorted = [...trunkNodes].sort((a, b) => a.offsetY - b.offsetY);
  const segments: VerticalTreeSegment[] = [];

  const firstGap = sorted[0].offsetY - circleRadius;
  if (firstGap > 0) {
    segments.push({ y1: 0, y2: firstGap });
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const y1 = sorted[index].offsetY + circleRadius;
    const y2 = sorted[index + 1].offsetY - circleRadius;
    if (y2 > y1) {
      const dashed =
        options?.dashedSpan != null &&
        index >= options.dashedSpan.fromIndex &&
        index < options.dashedSpan.toIndex;
      segments.push({ y1, y2, dashed });
    }
  }

  const lastNode = sorted[sorted.length - 1];
  const trunkEnd = lastNode.offsetY + circleRadius;
  const extendEnd = options?.lineExtendToY ?? trunkEnd;
  if (extendEnd > trunkEnd) {
    segments.push({ y1: trunkEnd, y2: extendEnd });
  }

  return segments;
}

export function resolveVerticalTreeHeight(
  trunkNodes: VerticalTreeNode[],
  circleRadius: number,
  lineExtendToY?: number,
  minHeight = 0,
): number {
  const trunkEnd =
    trunkNodes.length === 0
      ? 0
      : Math.max(...trunkNodes.map((node) => node.offsetY)) + circleRadius;
  const railEnd = Math.max(trunkEnd, lineExtendToY ?? 0);
  return Math.max(minHeight, railEnd);
}
