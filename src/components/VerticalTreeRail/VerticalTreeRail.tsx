import { MdOutlineCircle } from "../../icons";
import { colors } from "../../theme";
import {
  buildVerticalTreeSegments,
  resolveVerticalTreeHeight,
  type VerticalTreeCircleNode,
  type VerticalTreeNode,
} from "./verticalTreeRailMath";

export type { VerticalTreeNode, VerticalTreeCircleNode } from "./verticalTreeRailMath";

const DEFAULT_RAIL_WIDTH = 20;
const DEFAULT_CIRCLE_SIZE = 12;

export type VerticalTreeRailProps = {
  /** Trunk node centers used to route the vertical line. */
  trunkNodes: VerticalTreeNode[];
  /** Circles drawn on the rail (subset — e.g. hover-only picker nodes). */
  circleNodes: VerticalTreeCircleNode[];
  /** Rail canvas height (px). */
  height: number;
  /** Extend the trunk line below the last trunk node (px from rail top). */
  lineExtendToY?: number;
  /** Trunk segment index range (sorted) drawn dashed — e.g. add → back picker branch. */
  dashedSpan?: { fromIndex: number; toIndex: number };
  width?: number;
  circleSize?: number;
  lineColor?: string;
  circleColor?: string;
  circleBackdrop?: string;
  absolute?: boolean;
  left?: number;
  top?: number;
};

export function VerticalTreeRail({
  trunkNodes,
  circleNodes,
  height,
  lineExtendToY,
  dashedSpan,
  width = DEFAULT_RAIL_WIDTH,
  circleSize = DEFAULT_CIRCLE_SIZE,
  lineColor = colors.treeRail,
  circleColor = colors.treeRail,
  circleBackdrop = colors.surface,
  absolute = false,
  left = 0,
  top = 0,
}: VerticalTreeRailProps) {
  const circleRadius = circleSize / 2;
  const canvasHeight = resolveVerticalTreeHeight(
    trunkNodes,
    circleRadius,
    lineExtendToY,
    height,
  );
  const segments = buildVerticalTreeSegments(trunkNodes, circleRadius, {
    lineExtendToY,
    dashedSpan,
  });
  const lineLeft = width / 2;

  if (trunkNodes.length === 0 || canvasHeight <= 0) {
    return null;
  }

  return (
    <div
      aria-hidden
      style={{
        position: absolute ? "absolute" : "relative",
        left: absolute ? left : undefined,
        top: absolute ? top : undefined,
        width,
        height: canvasHeight,
        flexShrink: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {segments.map((segment, index) => (
        <div
          key={`segment-${index}`}
          style={{
            position: "absolute",
            left: lineLeft,
            top: segment.y1,
            width: 1,
            height: Math.max(0, segment.y2 - segment.y1),
            transform: "translateX(-50%)",
            ...(segment.dashed
              ? {
                  background: `repeating-linear-gradient(to bottom, ${lineColor} 0px, ${lineColor} 4px, transparent 4px, transparent 8px)`,
                }
              : { background: lineColor }),
          }}
        />
      ))}

      {circleNodes.map((node, index) => (
        <div
          key={`node-${index}-${node.offsetY}`}
          style={{
            position: "absolute",
            left: lineLeft,
            top: node.offsetY,
            width: circleSize,
            height: circleSize,
            transform: `translate(-50%, -50%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: circleBackdrop,
            borderRadius: 999,
          }}
        >
          <MdOutlineCircle
            size={circleSize}
            color={node.active ? colors.accent : circleColor}
          />
        </div>
      ))}
    </div>
  );
}
