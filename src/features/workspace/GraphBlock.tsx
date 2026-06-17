import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  IoChevronDown,
  IoChevronForward,
  IoPlay,
  IoSettingsOutline,
  IoSquare,
} from "../../icons";
import { Text, XStack, YStack } from "tamagui";
import type { TopologyBlock, TopologyNode } from "../../services/topology";
import { colors, graph, tamaguiSurfaces } from "../../theme";
import {
  BLOCK_CONTENT_WIDTH,
  BLOCK_MEMBER_GAP,
  BLOCK_NAME_HEIGHT,
  BLOCK_PADDING,
  getBlockRect,
  getBlockWidth,
  isMemberRunning,
} from "./blockLayout";
import { GraphServerRow, graphServerIconButtonStyle } from "./GraphServerRow";
import { openGraphContextMenu } from "./showNativeContextMenu";

const NAME_FONT_SIZE = 13;
const NAME_MAX_CHARS = 28;

function nameFieldWidthChars(name: string) {
  return Math.min(Math.max(name.length, 4), NAME_MAX_CHARS);
}

type GraphBlockProps = {
  block: TopologyBlock;
  members: TopologyNode[];
  zIndex: number;
  isWireSource: boolean;
  isHoverTarget: boolean;
  isDragging: boolean;
  interactionLocked: boolean;
  pointerPassthrough: boolean;
  onRename: (name: string) => void;
  onToggleCollapsed: () => void;
  onToggleMemberRunning: (memberId: string) => void;
  onOpenMemberSettings: (memberId: string) => void;
  onDeleteMember: (memberId: string) => void;
  onSeparateMember: (memberId: string) => void;
  onBlockPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onMemberPointerDown: (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function GraphBlock({
  block,
  members,
  zIndex,
  isWireSource,
  isHoverTarget,
  isDragging,
  interactionLocked,
  pointerPassthrough,
  onRename,
  onToggleCollapsed,
  onToggleMemberRunning,
  onOpenMemberSettings,
  onDeleteMember,
  onSeparateMember,
  onBlockPointerDown,
  onMemberPointerDown,
}: GraphBlockProps) {
  const collapsed = Boolean(block.collapsed);
  const width = getBlockWidth();
  const height = getBlockRect(block, members.length).height;
  const [editingName, setEditingName] = useState(false);
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const commitName = (raw: string) => {
    const next = raw.trim() || "Block";
    if (next !== block.name) {
      onRename(next);
    }
    setEditingName(false);
  };

  return (
    <div
      style={{
        position: "absolute",
        left: block.x,
        top: block.y,
        width,
        height,
        zIndex,
        userSelect: "none",
        touchAction: "none",
        pointerEvents: pointerPassthrough || interactionLocked ? "none" : "auto",
      }}
    >
      <YStack
        width="100%"
        height="100%"
        rounded={10}
        borderWidth={1}
        borderColor={
          isHoverTarget
            ? graph.highlightBorder
            : isWireSource
              ? graph.highlightBorderDim
              : graph.blockBorder
        }
        bg={graph.blockBg}
        overflow="hidden"
        style={{
          boxShadow: isHoverTarget
            ? `0 0 0 2px ${graph.highlightGlow}`
            : graph.shadowStrong,
        }}
      >
        <XStack
          height={BLOCK_NAME_HEIGHT}
          px={BLOCK_PADDING}
          items="center"
          gap={6}
          shrink={0}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
          onPointerDown={onBlockPointerDown}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapsed();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={collapsed ? "Expand block" : "Collapse block"}
            style={{
              width: 22,
              height: 22,
              border: "none",
              background: "transparent",
              color: colors.muted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            {collapsed ? <IoChevronForward size={14} /> : <IoChevronDown size={14} />}
          </button>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              height: "100%",
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setEditingName(true);
            }}
          >
            {editingName ? (
              <textarea
                ref={nameInputRef}
                rows={1}
                defaultValue={block.name}
                onBlur={(event) => commitName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitName(event.currentTarget.value);
                  }
                  if (event.key === "Escape") {
                    setEditingName(false);
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: `${nameFieldWidthChars(block.name)}ch`,
                  maxWidth: "100%",
                  minWidth: "4ch",
                  height: 24,
                  margin: 0,
                  padding: "2px 4px",
                  resize: "none",
                  overflow: "hidden",
                  border: "none",
                  outline: "none",
                  background: tamaguiSurfaces.controlHoverBg,
                  borderRadius: 4,
                  color: colors.foreground,
                  fontSize: NAME_FONT_SIZE,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  lineHeight: "20px",
                }}
              />
            ) : (
              <Text
                color={colors.foreground}
                fontSize={NAME_FONT_SIZE}
                fontWeight="600"
                numberOfLines={1}
                ellipsizeMode="tail"
                flex={1}
                minW={0}
                select="none"
                style={{ pointerEvents: "none" }}
              >
                {block.name}
              </Text>
            )}
          </div>
        </XStack>

        {!collapsed ? (
          <YStack px={BLOCK_PADDING} pb={BLOCK_PADDING} gap={BLOCK_MEMBER_GAP}>
            {members.map((member) => {
              const running = isMemberRunning(block, member.id);
              const rowHovered = hoveredMemberId === member.id;
              const buttonsHighlighted = rowHovered;
              return (
                <GraphServerRow
                  key={member.id}
                  name={member.name}
                  width={BLOCK_CONTENT_WIDTH}
                  running={running}
                  highlighted={rowHovered}
                  cursor={isDragging ? "grabbing" : "grab"}
                  onPointerEnter={() => setHoveredMemberId(member.id)}
                  onPointerLeave={() =>
                    setHoveredMemberId((current) => (current === member.id ? null : current))
                  }
                  onPointerDown={(event) => onMemberPointerDown(member.id, event)}
                  onContextMenu={(event) => {
                    openGraphContextMenu(event, [
                      {
                        id: "separate",
                        label: "Separate",
                        onSelect: () => onSeparateMember(member.id),
                      },
                      {
                        id: "delete",
                        label: "Delete",
                        onSelect: () => onDeleteMember(member.id),
                      },
                    ]);
                  }}
                  actions={
                    <>
                      <button
                        type="button"
                        style={graphServerIconButtonStyle(buttonsHighlighted)}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenMemberSettings(member.id);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        aria-label="MCP server details"
                      >
                        <IoSettingsOutline size={12} />
                      </button>

                      <button
                        type="button"
                        style={graphServerIconButtonStyle(buttonsHighlighted)}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleMemberRunning(member.id);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        aria-label={running ? "Pause server" : "Run server"}
                      >
                        {running ? <IoSquare size={11} /> : <IoPlay size={11} />}
                      </button>
                    </>
                  }
                />
              );
            })}
          </YStack>
        ) : null}
      </YStack>

      <div
        style={{
          position: "absolute",
          right: -5,
          top: height / 2 - 5,
          width: 10,
          height: 10,
          borderRadius: 999,
          background: colors.accent,
          boxShadow: `0 0 0 3px ${colors.accent}33`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
