import { colors } from "../../theme";
import {
  buildArcBranchPath,
  resolveProjectGitTreeHeight,
  type ProjectGitBranchTarget,
} from "./projectGitTreeRailMath";

export type { ProjectGitBranchTarget } from "./projectGitTreeRailMath";

const DEFAULT_RAIL_WIDTH = 20;

export type ProjectGitHorizontalConnector = {
  startX: number;
  endX: number;
  centerY: number;
};

export type ProjectGitTreeRailProps = {
  branchTargets: ProjectGitBranchTarget[];
  horizontalConnectors?: ProjectGitHorizontalConnector[];
  trunkStartY?: number;
  width?: number;
  lineColor?: string;
  absolute?: boolean;
  left?: number;
  top?: number;
  canvasWidth?: number;
};

export function ProjectGitTreeRail({
  branchTargets,
  horizontalConnectors = [],
  trunkStartY = 0,
  width = DEFAULT_RAIL_WIDTH,
  lineColor = colors.treeRail,
  absolute = false,
  left = 0,
  top = 0,
  canvasWidth,
}: ProjectGitTreeRailProps) {
  const trunkX = width / 2;
  const resolvedCanvasWidth = canvasWidth ?? width;
  const canvasHeight = resolveProjectGitTreeHeight(branchTargets, trunkStartY);
  const branchYs = branchTargets.map((target) => target.offsetY);
  const firstBranchY = branchYs.length > 0 ? Math.min(...branchYs) : trunkStartY;
  const lastBranchY = branchYs.length > 0 ? Math.max(...branchYs) : trunkStartY;

  if (canvasHeight <= 0 || branchTargets.length === 0) {
    return null;
  }

  return (
    <svg
      aria-hidden
      style={{
        position: absolute ? "absolute" : "relative",
        left: absolute ? left : undefined,
        top: absolute ? top : undefined,
        width: resolvedCanvasWidth,
        height: canvasHeight,
        flexShrink: 0,
        pointerEvents: "none",
        zIndex: 1,
        overflow: "visible",
      }}
    >
      {trunkStartY < firstBranchY ? (
        <line
          x1={trunkX}
          y1={trunkStartY}
          x2={trunkX}
          y2={firstBranchY}
          stroke={lineColor}
          strokeWidth={1}
        />
      ) : null}

      {lastBranchY > firstBranchY ? (
        <line
          x1={trunkX}
          y1={firstBranchY}
          x2={trunkX}
          y2={lastBranchY + 10}
          stroke={lineColor}
          strokeWidth={1}
        />
      ) : null}

      {branchTargets.map((target, index) => (
        <path
          key={`branch-${index}-${target.offsetY}`}
          d={buildArcBranchPath(trunkX, target.targetX, target.offsetY)}
          fill="none"
          stroke={lineColor}
          strokeWidth={1}
        />
      ))}

      {horizontalConnectors.map((connector, index) => (
        <line
          key={`connector-${index}`}
          x1={connector.startX}
          y1={connector.centerY}
          x2={connector.endX}
          y2={connector.centerY}
          stroke={lineColor}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}
