import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  BsServer,
  IoChevronDown,
  IoChevronForward,
  IoPlay,
  IoSettingsOutline,
  IoSquare,
} from "../../icons";
import { GraphContextMenu, type GraphContextMenuAction } from "./GraphContextMenu";
import { Text, XStack, YStack } from "tamagui";
import type { TopologyBlock, TopologyNode } from "../../services/topology";
import { borders, colors, graph, surfaces, tamaguiSurfaces } from "../../theme";
import {
  BLOCK_CONTENT_WIDTH,
  BLOCK_MEMBER_GAP,
  BLOCK_MEMBER_HEIGHT,
  BLOCK_NAME_HEIGHT,
  BLOCK_PADDING,
  getBlockRect,
  getBlockWidth,
  isMemberRunning,
} from "./blockLayout";

const NAME_FONT_SIZE = 13;
const NAME_MAX_CHARS = 28;

function iconButtonStyle(highlighted: boolean) {
  return {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: highlighted
      ? `1px solid ${graph.iconButtonBorder}`
      : `1px solid ${graph.iconButtonBorderDim}`,
    background: graph.iconButtonBg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
    opacity: highlighted ? 1 : 0.32,
    boxShadow: highlighted ? graph.shadowSoft : "none",
    transition: "opacity 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease",
  } as const;
}

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
  const [memberMenu, setMemberMenu] = useState<{
    memberId: string;
    x: number;
    y: number;
  } | null>(null);
  const nameInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const memberMenuActions: GraphContextMenuAction[] = memberMenu
    ? [
        {
          id: "separate",
          label: "Separate",
          onSelect: () => onSeparateMember(memberMenu.memberId),
        },
        {
          id: "delete",
          label: "Delete",
          destructive: true,
          onSelect: () => onDeleteMember(memberMenu.memberId),
        },
      ]
    : [];

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
                <XStack
                  key={member.id}
                  width={BLOCK_CONTENT_WIDTH}
                  height={BLOCK_MEMBER_HEIGHT}
                  px={6}
                  items="center"
                  gap={6}
                  rounded={8}
                  borderWidth={1}
                  borderColor={
                    running ? borders.focus : tamaguiSurfaces.activeBg
                  }
                  bg={running ? tamaguiSurfaces.controlBg : surfaces.disabled}
                  style={{ cursor: "grab" }}
                  onPointerEnter={() => setHoveredMemberId(member.id)}
                  onPointerLeave={() =>
                    setHoveredMemberId((current) => (current === member.id ? null : current))
                  }
                  onPointerDown={(event) => onMemberPointerDown(member.id, event)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMemberMenu({
                      memberId: member.id,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                >
                  <BsServer
                    size={15}
                    color={running || rowHovered ? colors.accent : colors.muted}
                    aria-hidden
                    style={{ flexShrink: 0 }}
                  />

                  <Text
                    color={running || rowHovered ? colors.foreground : colors.muted}
                    fontSize={12}
                    fontWeight="600"
                    numberOfLines={1}
                    flex={1}
                    select="none"
                  >
                    {member.name}
                  </Text>

                  <button
                    type="button"
                    style={{
                      ...iconButtonStyle(buttonsHighlighted),
                      color: buttonsHighlighted ? colors.foreground : colors.muted,
                    }}
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
                    style={{
                      ...iconButtonStyle(buttonsHighlighted),
                      color: buttonsHighlighted ? colors.foreground : colors.muted,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleMemberRunning(member.id);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label={running ? "Pause server" : "Run server"}
                  >
                    {running ? <IoSquare size={11} /> : <IoPlay size={11} />}
                  </button>

                </XStack>
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

      <GraphContextMenu
        open={memberMenu !== null}
        x={memberMenu?.x ?? 0}
        y={memberMenu?.y ?? 0}
        actions={memberMenuActions}
        onClose={() => setMemberMenu(null)}
      />
    </div>
  );
}
