import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { IoAdd, IoChevronUp, IoTrash } from "../../icons";
import { Text, XStack, YStack } from "tamagui";
import { ToolbarChevron } from "../../components/pane";
import { PaneEllipsis } from "../../components/pane/PaneExpandableText";
import { PANE_ROW_MIN_HEIGHT, PANE_ROW_PADDING, PANE_ROW_RADIUS } from "../../components/pane/paneStyles";
import { VerticalTreeRail } from "../../components/VerticalTreeRail";
import { openMcpServerDetail } from "../../navigation/appNavigation";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import {
  fetchRegistryEntryForInstalled,
  resolveRegistryEntryFromInstalled,
} from "../../services/mcp_installed";
import { startMcpOAuthSignIn } from "../../services/mcp_installed/oauthApi";
import type { Preset } from "../../services/presets";
import { borders, colors, dangerAlpha } from "../../theme";
import { McpPanel } from "../mcp/McpPanel";
import type { McpListCardConnectionStatus } from "../mcp/mcpConnectionListStatus";
import { MCP_CARD_HEADER_Z_INDEX, MCP_LIST_STICKY_TOP } from "../mcp/mcpScrollLayout";
import { McpInstalledListCard } from "../mcp/McpInstalledListCard";
import { clampScrollParentAndRevealAnchor } from "../mcp/detailPanelScroll";
import { resolveInstalledListDescription } from "../mcp/mcpDescriptionCache";
import { PresetPickerServerRow } from "./PresetPickerServerRow";
import { presetTreeCardWidthStyle } from "./presetTreeCardLayout";
import { PresetSectionCountLabel } from "./PresetSectionCountLabel";
import { usePresetBlockTree } from "./usePresetBlockTree";

type PresetBlockProps = {
  preset: Preset;
  installedServers: InstalledMcpServer[];
  connectionStatuses: Record<number, McpListCardConnectionStatus>;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDeletePreset: () => void;
  onAddServer: (mcpServerId: number) => void;
  onRemoveServer: (mcpServerId: number) => void;
};

const TREE_RAIL_WIDTH = 20;
const TREE_CONTENT_INDENT = PANE_ROW_PADDING + TREE_RAIL_WIDTH + 6;
const PRESET_BLOCK_RADIUS = 8;
/** Inset before first tree row — line still starts flush under the header. */
const PRESET_TREE_FIRST_ROW_INSET = PANE_ROW_PADDING;

function PresetServerCard({
  server,
  connectionStatus,
  onRemove,
}: {
  server: InstalledMcpServer;
  connectionStatus?: McpListCardConnectionStatus;
  onRemove?: () => void;
}) {
  const registryEntry = resolveRegistryEntryFromInstalled(server);
  void fetchRegistryEntryForInstalled(server);

  return (
    <div style={presetTreeCardWidthStyle}>
      <McpInstalledListCard
        server={server}
        registryEntry={registryEntry}
        description={resolveInstalledListDescription(server.id, registryEntry)}
        connectionStatus={connectionStatus}
        hideRefresh
        alwaysShowReadMore
        readMoreTextOnly
        onDelete={onRemove}
        onSignIn={() => void startMcpOAuthSignIn(server.id)}
        onReadMore={() => openMcpServerDetail(server)}
      />
    </div>
  );
}

export function PresetBlock({
  preset,
  installedServers,
  connectionStatuses,
  expanded,
  onExpandedChange,
  onDeletePreset,
  onAddServer,
  onRemoveServer,
}: PresetBlockProps) {
  const [addExpanded, setAddExpanded] = useState(false);
  const [hoveredPickerIndex, setHoveredPickerIndex] = useState<number | null>(null);
  const addScrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const wasAddExpandedRef = useRef(false);

  const serversById = useMemo(
    () => new Map(installedServers.map((server) => [server.id, server])),
    [installedServers],
  );

  const presetServers = useMemo(
    () =>
      preset.mcpServerIds
        .map((id) => serversById.get(id))
        .filter((server): server is InstalledMcpServer => Boolean(server)),
    [preset.mcpServerIds, serversById],
  );

  const availableServers = useMemo(
    () => installedServers.filter((server) => !preset.mcpServerIds.includes(server.id)),
    [installedServers, preset.mcpServerIds],
  );

  const connectedCount = useMemo(
    () =>
      presetServers.filter((server) => connectionStatuses[server.id] === "connected").length,
    [connectionStatuses, presetServers],
  );

  const showTree = expanded;
  const { containerRef, setServerRef, setAddRef, setBackRef, setPickerRef, rail } = usePresetBlockTree({
    serverCount: presetServers.length,
    pickerCount: addExpanded ? availableServers.length : 0,
    addExpanded,
    hoveredPickerIndex: addExpanded ? hoveredPickerIndex : null,
    enabled: showTree,
  });

  const collapseAdd = () => {
    setAddExpanded(false);
    setHoveredPickerIndex(null);
  };

  useLayoutEffect(() => {
    if (wasAddExpandedRef.current && !addExpanded) {
      const anchor = addScrollAnchorRef.current;
      if (!anchor) {
        wasAddExpandedRef.current = addExpanded;
        return;
      }

      const syncScroll = () => {
        if (addScrollAnchorRef.current) {
          clampScrollParentAndRevealAnchor(addScrollAnchorRef.current);
        }
      };

      syncScroll();
      requestAnimationFrame(() => {
        syncScroll();
        requestAnimationFrame(syncScroll);
      });
    }
    wasAddExpandedRef.current = addExpanded;
  }, [addExpanded]);

  const addRowButtonStyle = {
    ...presetTreeCardWidthStyle,
    minHeight: PANE_ROW_MIN_HEIGHT,
    padding: `${PANE_ROW_PADDING}px ${PANE_ROW_PADDING + 2}px`,
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderRadius: PANE_ROW_RADIUS,
    border: `1px solid ${borders.default}`,
    background: "transparent",
    boxSizing: "border-box" as const,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const addRowIconStyle = {
    width: 14,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.muted,
    flexShrink: 0,
  } as const;

  const addRowLabelStyle = {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: 600,
    userSelect: "none" as const,
  };

  const handlePickServer = (server: InstalledMcpServer) => {
    onAddServer(server.id);
    setHoveredPickerIndex(null);
  };

  const headerRow = (
    <XStack
      width="100%"
      items="center"
      justify="space-between"
      gap={10}
      minH={PANE_ROW_MIN_HEIGHT}
      px={PANE_ROW_PADDING}
      py={PANE_ROW_PADDING}
      cursor="pointer"
      onPress={() => onExpandedChange(!expanded)}
    >
      <XStack items="center" gap={8} flex={1} minW={0}>
        <XStack width={14} items="center" justify="center" shrink={0}>
          <ToolbarChevron expanded={expanded} size={12} variant="disclosure" />
        </XStack>

        <PaneEllipsis
          style={{
            color: colors.foreground,
            fontSize: 14,
            fontWeight: 600,
            userSelect: "none",
            flex: "0 1 auto",
            minWidth: 0,
          }}
        >
          {preset.name}
        </PaneEllipsis>

        <XStack gap={8} items="center" shrink={0} ml={24}>
          <PresetSectionCountLabel count={presetServers.length} label="Servers" />
          <PresetSectionCountLabel count={connectedCount} label="Connected" />
        </XStack>
      </XStack>

      <XStack
        items="center"
        gap={6}
        shrink={0}
        height={PANE_ROW_MIN_HEIGHT}
        onPress={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Delete preset"
          onClick={() => onDeletePreset()}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = dangerAlpha[12];
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = "transparent";
          }}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: colors.muted,
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IoTrash size={14} />
        </button>
      </XStack>
    </XStack>
  );

  return (
    <YStack width="100%" gap={0}>
      <div
        style={
          expanded
            ? {
                position: "sticky",
                top: MCP_LIST_STICKY_TOP,
                zIndex: MCP_CARD_HEADER_Z_INDEX,
                background: colors.page,
              }
            : undefined
        }
      >
        <McpPanel
          className="mcp-list-card-shell"
          p={0}
          rounded={PRESET_BLOCK_RADIUS}
          borderWidth={1}
          borderColor={expanded ? borders.default : undefined}
          clip={false}
          overflow="hidden"
        >
          {headerRow}
        </McpPanel>
      </div>

      {expanded ? (
        <div
          style={{
            paddingRight: PANE_ROW_PADDING,
            paddingBottom: PANE_ROW_PADDING,
            paddingLeft: PANE_ROW_PADDING,
          }}
        >
          <div
            ref={containerRef}
            style={{ position: "relative", overflow: "hidden" }}
          >
            {rail.ready ? (
              <VerticalTreeRail
                trunkNodes={rail.trunkNodes}
                circleNodes={rail.circleNodes}
                dashedSpan={rail.dashedSpan}
                height={0}
                circleBackdrop={colors.page}
                absolute
                left={PANE_ROW_PADDING}
                top={0}
              />
            ) : null}

            <YStack
              gap={8}
              width="100%"
              position="relative"
              z={1}
              pt={PRESET_TREE_FIRST_ROW_INSET}
              pl={TREE_CONTENT_INDENT - PANE_ROW_PADDING}
            >
              {presetServers.map((server, index) => (
                <div key={server.id} ref={setServerRef(index)}>
                  <PresetServerCard
                    server={server}
                    connectionStatus={connectionStatuses[server.id]}
                    onRemove={() => onRemoveServer(server.id)}
                  />
                </div>
              ))}

              <div ref={addScrollAnchorRef}>
                <div ref={setAddRef}>
                  <button
                    type="button"
                    aria-label={addExpanded ? "Collapse add server list" : "Add server"}
                    aria-expanded={addExpanded}
                    onClick={() => {
                      if (addExpanded) {
                        collapseAdd();
                        return;
                      }
                      setAddExpanded(true);
                    }}
                    className="mcp-list-card-shell"
                    style={addRowButtonStyle}
                  >
                    <span style={addRowIconStyle} aria-hidden>
                      <IoAdd size={16} />
                    </span>
                    <span style={addRowLabelStyle}>Add server</span>
                  </button>
                </div>
              </div>

              {addExpanded ? (
                <YStack gap={8} width="100%">
                  {availableServers.length === 0 ? (
                    <Text color={colors.muted} fontSize={12} px={2} py={4} select="none">
                      All installed servers are already in this preset.
                    </Text>
                  ) : (
                    availableServers.map((server, index) => (
                      <div key={server.id} ref={setPickerRef(index)}>
                        <PresetPickerServerRow
                          server={server}
                          connectionStatus={connectionStatuses[server.id]}
                          hovered={hoveredPickerIndex === index}
                          onHoverStart={() => setHoveredPickerIndex(index)}
                          onHoverEnd={() =>
                            setHoveredPickerIndex((current) => (current === index ? null : current))
                          }
                          onPick={() => handlePickServer(server)}
                        />
                      </div>
                    ))
                  )}

                  <div ref={setBackRef}>
                    <button
                      type="button"
                      aria-label="Back"
                      onClick={collapseAdd}
                      className="mcp-list-card-shell"
                      style={addRowButtonStyle}
                    >
                      <span style={addRowIconStyle} aria-hidden>
                        <IoChevronUp size={16} />
                      </span>
                      <span style={addRowLabelStyle}>Back</span>
                    </button>
                  </div>
                </YStack>
              ) : null}
            </YStack>
          </div>
        </div>
      ) : null}
    </YStack>
  );
}
