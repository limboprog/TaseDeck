import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { IoChevronDown, IoChevronUp, IoSettingsOutline } from "../../icons";
import { Text, YStack } from "tamagui";
import type { TopologyNode } from "../../services/topology";
import { borders, colors, graph } from "../../theme";
import { GRAPH_SERVER_ROW_HEIGHT, NODE_WIDTH } from "./graphLayoutConstants";
import { GraphServerRow, graphServerIconButtonStyle } from "./GraphServerRow";
import { openGraphContextMenu } from "./showNativeContextMenu";

export { NODE_WIDTH, NODE_HEADER_HEIGHT } from "./graphLayoutConstants";

type GraphNodeProps = {
  node: TopologyNode;
  linkedMcpNames: string[];
  running: boolean;
  isWireSource: boolean;
  isHoverTarget: boolean;
  isDragging: boolean;
  interactionLocked: boolean;
  onToggleExpand: () => void;
  onOpenSettings?: () => void;
  onDelete?: () => void;
  onSeparate?: () => void;
  onNodePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function GraphNode({
  node,
  linkedMcpNames,
  running,
  isWireSource,
  isHoverTarget,
  isDragging,
  interactionLocked,
  onToggleExpand,
  onOpenSettings,
  onDelete,
  onSeparate,
  onNodePointerDown,
}: GraphNodeProps) {
  const isAgent = node.type === "agent";
  const isMcp = node.type === "mcp";
  const expanded = Boolean(node.expanded) && isAgent;
  const [rowHovered, setRowHovered] = useState(false);
  const inBlock = Boolean(node.blockId);
  const buttonsHighlighted = rowHovered;

  const wireBorderColor = isHoverTarget
    ? graph.highlightBorder
    : isWireSource
      ? graph.highlightBorderDim
      : undefined;

  const contextMenuItems = [
    ...(onSeparate && inBlock
      ? [
          {
            id: "separate",
            label: "Separate",
            onSelect: onSeparate,
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            id: "delete",
            label: "Delete",
            onSelect: onDelete,
          },
        ]
      : []),
  ];

  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        zIndex: isDragging ? 100 : isHoverTarget || isWireSource || expanded ? 4 : 3,
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
        pointerEvents: interactionLocked ? "none" : "auto",
      }}
    >
      <GraphServerRow
        name={node.name}
        width={NODE_WIDTH}
        standalone
        running={running}
        highlighted={rowHovered || isHoverTarget || isWireSource}
        borderColor={wireBorderColor ?? borders.focus}
        cursor={isDragging ? "grabbing" : "grab"}
        onPointerEnter={() => setRowHovered(true)}
        onPointerLeave={() => setRowHovered(false)}
        onPointerDown={onNodePointerDown}
        onContextMenu={(event) => {
          if (!isAgent && contextMenuItems.length > 0) {
            openGraphContextMenu(event, contextMenuItems);
          } else if (isAgent && onDelete) {
            openGraphContextMenu(event, [
              { id: "delete", label: "Delete", onSelect: onDelete },
            ]);
          }
        }}
        icon={isAgent ? null : undefined}
        actions={
          <>
            {isAgent ? (
              <button
                type="button"
                style={graphServerIconButtonStyle(buttonsHighlighted)}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpand();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label={expanded ? "Collapse connections" : "Show connections"}
              >
                {expanded ? <IoChevronUp size={12} /> : <IoChevronDown size={12} />}
              </button>
            ) : null}

            {isMcp && onOpenSettings ? (
              <button
                type="button"
                style={graphServerIconButtonStyle(buttonsHighlighted)}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenSettings();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label="MCP server details"
              >
                <IoSettingsOutline size={12} />
              </button>
            ) : null}
          </>
        }
      />

      {expanded ? (
        <YStack
          position="absolute"
          px={8}
          py={6}
          gap={2}
          bg={graph.nodeBg}
          borderWidth={1}
          borderColor={borders.focus}
          rounded={10}
          width={NODE_WIDTH}
          style={{
            top: GRAPH_SERVER_ROW_HEIGHT,
            left: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            boxShadow: graph.shadowStrong,
            zIndex: 2,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Text color={colors.muted} fontSize={10} fontWeight="600" px={8} pt={2} select="none">
            CONNECTED MCP
          </Text>
          {linkedMcpNames.length === 0 ? (
            <Text color={colors.muted} fontSize={11} px={8} py={4} select="none">
              Click node, drag edge to MCP
            </Text>
          ) : (
            linkedMcpNames.map((name) => (
              <Text key={name} color={colors.foreground} fontSize={11} px={8} py={2} select="none">
                {name}
              </Text>
            ))
          )}
        </YStack>
      ) : null}
    </div>
  );
}

export function getNodeHeight(node: TopologyNode, linkedCount: number) {
  if (!node.expanded || node.type !== "agent") {
    return GRAPH_SERVER_ROW_HEIGHT;
  }

  const linkedSection = linkedCount > 0 ? linkedCount * 20 + 24 : 28;
  return GRAPH_SERVER_ROW_HEIGHT + linkedSection + 12;
}
