import { useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  BsServer,
  IoChevronDown,
  IoChevronUp,
  IoClose,
  IoSettingsOutline,
} from "../../icons";
import { Button, Text, XStack, YStack } from "tamagui";
import type { TopologyNode } from "../../services/topology";
import { borders, colors, graph, tamaguiSurfaces } from "../../theme";
import { GraphContextMenu, type GraphContextMenuAction } from "./GraphContextMenu";

export const NODE_WIDTH = 196;
export const NODE_HEADER_HEIGHT = 44;

type GraphNodeProps = {
  node: TopologyNode;
  linkedMcpNames: string[];
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
  const expanded = Boolean(node.expanded) && isAgent;
  const inBlock = Boolean(node.blockId);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const contextMenuActions: GraphContextMenuAction[] = [
    {
      id: "separate",
      label: "Separate",
      disabled: !inBlock,
      onSelect: () => onSeparate?.(),
    },
    {
      id: "delete",
      label: "Delete",
      destructive: true,
      onSelect: () => onDelete?.(),
    },
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
      <YStack
        position="relative"
        rounded={10}
        borderWidth={1}
        borderColor={
          isHoverTarget
            ? graph.highlightBorder
            : isWireSource
              ? graph.highlightBorderDim
              : borders.selected
        }
        bg={graph.nodeBg}
        overflow="visible"
        height={NODE_HEADER_HEIGHT}
        style={{
          boxShadow: isHoverTarget
            ? `0 0 0 2px ${graph.highlightGlow}`
            : graph.shadow,
        }}
      >
        <XStack
          height={NODE_HEADER_HEIGHT}
          px={10}
          items="center"
          justify="space-between"
          gap={8}
          bg={isAgent ? graph.nodeHeaderAgent : graph.nodeHeaderMcp}
          style={{
            borderRadius: expanded ? "10px 10px 0 0" : 10,
            cursor: isDragging ? "grabbing" : "grab",
          }}
          onPointerDown={onNodePointerDown}
          onContextMenu={
            !isAgent
              ? (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenu({ x: event.clientX, y: event.clientY });
                }
              : undefined
          }
        >
          {isAgent ? null : (
            <BsServer size={15} color={colors.accent} aria-hidden style={{ flexShrink: 0 }} />
          )}

          <Text
            color={colors.foreground}
            fontSize={13}
            fontWeight="600"
            numberOfLines={1}
            flex={1}
            minW={0}
            select="none"
          >
            {node.name}
          </Text>

          <XStack items="center" gap={4} shrink={0}>
            {isAgent ? (
              <Button
                unstyled
                width={24}
                height={24}
                rounded={6}
                hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
                onPress={(event) => {
                  event.stopPropagation();
                  onToggleExpand();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label={expanded ? "Collapse connections" : "Show connections"}
              >
                <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
                  {expanded ? <IoChevronUp size={14} /> : <IoChevronDown size={14} />}
                </XStack>
              </Button>
            ) : null}

            {!isAgent && onOpenSettings ? (
              <Button
                unstyled
                width={24}
                height={24}
                rounded={6}
                hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
                onPress={(event) => {
                  event.stopPropagation();
                  onOpenSettings();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label="MCP server details"
              >
                <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
                  <IoSettingsOutline size={14} />
                </XStack>
              </Button>
            ) : null}

            {isAgent && onDelete ? (
              <Button
                unstyled
                width={24}
                height={24}
                rounded={6}
                hoverStyle={{ bg: tamaguiSurfaces.dangerHoverBg }}
                onPress={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label="Remove node"
              >
                <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
                  <IoClose size={14} />
                </XStack>
              </Button>
            ) : null}
          </XStack>
        </XStack>

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
              top: NODE_HEADER_HEIGHT,
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
      </YStack>

      {!isAgent ? (
        <GraphContextMenu
          open={contextMenu !== null}
          x={contextMenu?.x ?? 0}
          y={contextMenu?.y ?? 0}
          actions={contextMenuActions}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}

export function getNodeHeight(node: TopologyNode, linkedCount: number) {
  if (!node.expanded || node.type !== "agent") {
    return NODE_HEADER_HEIGHT;
  }

  const linkedSection = linkedCount > 0 ? linkedCount * 20 + 24 : 28;
  return NODE_HEADER_HEIGHT + linkedSection + 12;
}
