import { Text } from "tamagui";
import { VerticalTreeRail } from "../../components/VerticalTreeRail";
import { PANE_ROW_PADDING } from "../../components/pane/paneStyles";
import type { AgentRecord } from "../../services/agents/recordsApi";
import { colors } from "../../theme";
import {
  resolveNavEdgeExtensions,
  resolveNavHighlightY,
  resolveNavNodeY,
  resolveNavTreeHeight,
  type ProjectNavigationState,
} from "./useProjectNavigationState";

type ProjectNavigationPanelProps = {
  agents: AgentRecord[];
  navigation: ProjectNavigationState;
  onSelectAgent: (agentId: number) => void;
};

const NAV_RAIL_WIDTH = 22;
const NAV_CIRCLE_SIZE = 14;
const NAV_CONTENT_INDENT = NAV_RAIL_WIDTH + 12;
const NAV_LABEL_ROW_HEIGHT = 26;
export const NAV_PANEL_WIDTH = 212;

export function ProjectNavigationPanel({
  agents,
  navigation,
  onSelectAgent,
}: ProjectNavigationPanelProps) {
  const { activeAgentId } = navigation;
  const nodeCount = agents.length;
  const activeIndex = activeAgentId != null ? agents.findIndex((agent) => agent.id === activeAgentId) : 0;
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  const highlightY = resolveNavHighlightY(resolvedActiveIndex, nodeCount);
  const treeHeight = resolveNavTreeHeight(nodeCount);
  const trunkX = NAV_RAIL_WIDTH / 2;
  const edges = resolveNavEdgeExtensions();
  const floorIndex = resolvedActiveIndex;
  const hasPrev = floorIndex > 0;
  const hasNext = floorIndex < nodeCount - 1;

  const trunkNodes = agents.map((_, index) => ({
    offsetY: resolveNavNodeY(index),
  }));
  const circleNodes = agents.map((_, index) => ({
    offsetY: resolveNavNodeY(index),
    active: false,
  }));

  return (
    <div
      style={{
        width: NAV_PANEL_WIDTH,
        padding: `0 ${PANE_ROW_PADDING}px`,
        boxSizing: "border-box",
      }}
    >
      <Text
        color={colors.muted}
        fontSize={11}
        fontWeight="600"
        letterSpacing={0.4}
        textTransform="uppercase"
        mb={12}
        select="none"
      >
        Navigation
      </Text>

      <div style={{ position: "relative", minHeight: treeHeight }}>
        <VerticalTreeRail
          trunkNodes={trunkNodes}
          circleNodes={circleNodes}
          height={treeHeight}
          width={NAV_RAIL_WIDTH}
          circleSize={NAV_CIRCLE_SIZE}
          lineColor={colors.treeRail}
          circleColor={colors.treeRail}
          circleBackdrop={colors.page}
          absolute
          left={0}
          top={0}
        />

        <svg
          aria-hidden
          width={NAV_RAIL_WIDTH}
          height={treeHeight}
          style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        >
          {hasPrev && edges.up > 0.5 ? (
            <line
              x1={trunkX}
              y1={highlightY - edges.up}
              x2={trunkX}
              y2={highlightY}
              stroke={colors.accent}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : null}
          {hasNext && edges.down > 0.5 ? (
            <line
              x1={trunkX}
              y1={highlightY}
              x2={trunkX}
              y2={highlightY + edges.down}
              stroke={colors.accent}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : null}
          <circle
            cx={trunkX}
            cy={highlightY}
            r={6}
            fill={colors.page}
            stroke={colors.accent}
            strokeWidth={2}
          />
        </svg>

        <div style={{ marginLeft: NAV_CONTENT_INDENT, position: "relative", minHeight: treeHeight }}>
          {agents.map((agent, index) => {
            const nodeY = resolveNavNodeY(index);
            const isActive = agent.id === activeAgentId;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelectAgent(agent.id)}
                style={{
                  position: "absolute",
                  top: nodeY - NAV_LABEL_ROW_HEIGHT / 2,
                  left: 0,
                  right: 0,
                  height: NAV_LABEL_ROW_HEIGHT,
                  display: "flex",
                  alignItems: "center",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    color: isActive ? colors.foreground : colors.muted,
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 500,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                  }}
                >
                  {agent.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
