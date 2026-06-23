import { memo, useCallback, useMemo, useRef, useState } from "react";
import { IoAdd, IoChevronUp } from "../../icons";
import { Text } from "tamagui";
import { PANE_ROW_MIN_HEIGHT, PANE_ROW_PADDING, PANE_ROW_RADIUS } from "../../components/pane/paneStyles";
import { VerticalTreeRail } from "../../components/VerticalTreeRail";
import type { AgentRecord } from "../../services/agents/recordsApi";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import type { AgentPresetMode, ProjectPresetServerDetail } from "../../services/projects/detailApi";
import type { ProjectConfigOverrides, ProjectServerOverridePatch } from "../../services/projects/projectOverrides";
import { borders, colors } from "../../theme";
import { PresetPickerServerRow } from "../presets/PresetPickerServerRow";
import { ProjectAgentPresetRow } from "./ProjectAgentPresetRow";
import {
  PROJECT_AGENT_NODE_WIDTH,
  PROJECT_NODE_CONNECTOR_WIDTH,
  PROJECT_SERVER_COLUMN_WIDTH,
  PROJECT_SERVER_TREE_CONTENT_INDENT,
  PROJECT_SERVER_TREE_RAIL_WIDTH,
} from "./projectLayout";
import { ProjectServerConfigCard } from "./ProjectServerConfigCard";
import { useProjectServerTree } from "./useProjectServerTree";

const SERVER_TREE_RAIL_WIDTH = PROJECT_SERVER_TREE_RAIL_WIDTH;
const SERVER_TREE_CONTENT_INDENT = PROJECT_SERVER_TREE_CONTENT_INDENT;
const SERVER_COLUMN_LEFT = PROJECT_AGENT_NODE_WIDTH + PROJECT_NODE_CONNECTOR_WIDTH;
const SERVER_TREE_TRUNK_X = SERVER_TREE_RAIL_WIDTH / 2;

const addRowButtonStyle = {
  width: "100%",
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

type ProjectAgentBranchProps = {
  rowRef?: (node: HTMLDivElement | null) => void;
  agentRightRef?: (node: HTMLDivElement | null) => void;
  presetRef?: (node: HTMLDivElement | null) => void;
  agent: AgentRecord;
  presetName: string | null;
  presetMode?: AgentPresetMode | null;
  canAddServers?: boolean;
  presetAction?: React.ReactNode;
  servers: ProjectPresetServerDetail[];
  installedServers: InstalledMcpServer[];
  committedOverrides: ProjectConfigOverrides;
  draftOverrides: ProjectConfigOverrides;
  addServerExpanded: boolean;
  onOpenAddServer: () => void;
  onCollapseAddServer: () => void;
  onAddServer: (mcpServerId: number) => void;
  onRemoveServer: (mcpServerId: number) => void;
  onDraftOverrideChange: (serverKey: string, patch: ProjectServerOverridePatch) => void;
  onSaveToProject: (serverKey: string, patch: ProjectServerOverridePatch) => void;
  onResetDraft: (serverKey: string) => void;
  toolsHistoryToken?: number;
  enabled: boolean;
  expandedServerKeys?: ReadonlySet<string>;
  onServerExpandedChange?: (cardKey: string, expanded: boolean) => void;
  agentId: number;
};

type ServerCardSlotProps = {
  serverKey: string;
  server: InstalledMcpServer;
  committedPatch?: ProjectServerOverridePatch;
  draftPatch?: ProjectServerOverridePatch;
  onDraftOverrideChange: (serverKey: string, patch: ProjectServerOverridePatch) => void;
  onSaveToProject: (serverKey: string, patch: ProjectServerOverridePatch) => void;
  onResetDraft: (serverKey: string) => void;
  toolsHistoryToken?: number;
  onRemove?: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

const ServerCardSlot = memo(function ServerCardSlot({
  serverKey,
  server,
  committedPatch,
  draftPatch,
  onDraftOverrideChange,
  onSaveToProject,
  onResetDraft,
  toolsHistoryToken,
  onRemove,
  expanded,
  onExpandedChange,
}: ServerCardSlotProps) {
  const onDraft = useCallback(
    (patch: ProjectServerOverridePatch) => {
      onDraftOverrideChange(serverKey, patch);
    },
    [onDraftOverrideChange, serverKey],
  );

  const onSave = useCallback(
    (patch: ProjectServerOverridePatch) => {
      onSaveToProject(serverKey, patch);
    },
    [onSaveToProject, serverKey],
  );

  const onReset = useCallback(() => {
    onResetDraft(serverKey);
  }, [onResetDraft, serverKey]);

  return (
    <ProjectServerConfigCard
      serverKey={serverKey}
      server={server}
      committedPatch={committedPatch}
      draftPatch={draftPatch}
      onDraftOverrideChange={onDraft}
      onSaveToProject={onSave}
      onResetDraft={onReset}
      toolsHistoryToken={toolsHistoryToken}
      onRemove={onRemove}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
    />
  );
});

function ProjectAgentBranchInner({
  rowRef,
  agentRightRef,
  presetRef,
  agent,
  presetName,
  presetMode,
  canAddServers = true,
  presetAction,
  servers,
  installedServers,
  committedOverrides,
  draftOverrides,
  addServerExpanded,
  onOpenAddServer,
  onCollapseAddServer,
  onAddServer,
  onRemoveServer,
  onDraftOverrideChange,
  onSaveToProject,
  onResetDraft,
  toolsHistoryToken,
  enabled,
  expandedServerKeys,
  onServerExpandedChange,
  agentId,
}: ProjectAgentBranchProps) {
  const onDraftOverrideChangeRef = useRef(onDraftOverrideChange);
  onDraftOverrideChangeRef.current = onDraftOverrideChange;

  const stableOnDraftOverrideChange = useCallback(
    (serverKey: string, patch: ProjectServerOverridePatch) => {
      onDraftOverrideChangeRef.current(serverKey, patch);
    },
    [],
  );
  const onResetDraftRef = useRef(onResetDraft);
  onResetDraftRef.current = onResetDraft;

  const stableOnResetDraft = useCallback((serverKey: string) => {
    onResetDraftRef.current(serverKey);
  }, []);

  const onSaveToProjectRef = useRef(onSaveToProject);
  onSaveToProjectRef.current = onSaveToProject;

  const stableOnSaveToProject = useCallback(
    (serverKey: string, patch: ProjectServerOverridePatch) => {
      onSaveToProjectRef.current(serverKey, patch);
    },
    [],
  );
  const [hoveredPickerIndex, setHoveredPickerIndex] = useState<number | null>(null);

  const assignedServerIds = useMemo(
    () => new Set(servers.map((entry) => entry.server.id)),
    [servers],
  );

  const availableServers = useMemo(
    () => installedServers.filter((server) => !assignedServerIds.has(server.id)),
    [assignedServerIds, installedServers],
  );

  const {
    containerRef,
    setServerRef,
    setAddRef,
    setBackRef,
    setPickerRef,
    scheduleRemeasure,
    rail,
  } = useProjectServerTree({
    serverCount: servers.length,
    pickerCount: addServerExpanded ? availableServers.length : 0,
    addExpanded: addServerExpanded,
    hoveredPickerIndex: addServerExpanded ? hoveredPickerIndex : null,
    enabled: enabled,
  });

  const showRail = rail.trunkNodes.length > 0;

  return (
    <div ref={rowRef} style={{ width: "100%", overflow: "visible" }}>
      <ProjectAgentPresetRow
        agent={agent}
        presetName={presetName}
        presetMode={presetMode}
        agentRightRef={agentRightRef}
        presetRef={presetRef}
        presetAction={presetAction}
      />

      <div
        style={{
          marginLeft: SERVER_COLUMN_LEFT,
          marginTop: 0,
          width: PROJECT_SERVER_COLUMN_WIDTH,
          maxWidth: "100%",
          position: "relative",
          overflow: "visible",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: SERVER_TREE_TRUNK_X,
            top: 0,
            width: 1,
            height: 10,
            background: colors.treeRail,
            transform: "translateX(-50%)",
            zIndex: 0,
          }}
        />
        <div
          ref={containerRef}
          style={{
            position: "relative",
            overflow: "visible",
            paddingTop: 10,
          }}
        >
          {showRail ? (
            <VerticalTreeRail
              trunkNodes={rail.trunkNodes}
              circleNodes={rail.circleNodes}
              dashedSpan={rail.dashedSpan}
              height={rail.height}
              width={SERVER_TREE_RAIL_WIDTH}
              lineColor={colors.treeRail}
              circleColor={colors.treeRail}
              circleBackdrop={colors.page}
              absolute
              left={0}
              top={0}
            />
          ) : null}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              paddingLeft: SERVER_TREE_CONTENT_INDENT,
              position: "relative",
              overflow: "visible",
            }}
          >
            {servers.map((entry, index) => {
              const cardKey = `${agentId}:${entry.serverKey}`;
              return (
              <div key={`${entry.serverKey}-${entry.server.id}`} ref={setServerRef(index)}>
                <ServerCardSlot
                  serverKey={entry.serverKey}
                  server={entry.server}
                  committedPatch={committedOverrides[entry.serverKey]}
                  draftPatch={
                    Object.prototype.hasOwnProperty.call(draftOverrides, entry.serverKey)
                      ? draftOverrides[entry.serverKey]
                      : undefined
                  }
                  onDraftOverrideChange={stableOnDraftOverrideChange}
                  onSaveToProject={stableOnSaveToProject}
                  onResetDraft={stableOnResetDraft}
                  toolsHistoryToken={toolsHistoryToken}
                  onRemove={
                    canAddServers ? () => onRemoveServer(entry.server.id) : undefined
                  }
                  expanded={expandedServerKeys?.has(cardKey)}
                  onExpandedChange={(next) => onServerExpandedChange?.(cardKey, next)}
                />
              </div>
            );
            })}

            {canAddServers ? (
            <div ref={setAddRef}>
              <button
                type="button"
                aria-label={addServerExpanded ? "Collapse add server list" : "Add server"}
                aria-expanded={addServerExpanded}
                onClick={() => {
                  if (addServerExpanded) {
                    onCollapseAddServer();
                    return;
                  }
                  onOpenAddServer();
                }}
                style={addRowButtonStyle}
              >
                <span
                  style={{
                    width: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: colors.muted,
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  <IoAdd size={14} />
                </span>
                <Text color={colors.foreground} fontSize={14} fontWeight="600" select="none">
                  Add server
                </Text>
              </button>
            </div>
            ) : null}

            {canAddServers && addServerExpanded ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {availableServers.length === 0 ? (
                  <Text color={colors.muted} fontSize={12} py={4} select="none">
                    No installed MCP servers available to add.
                  </Text>
                ) : (
                  availableServers.map((server, index) => (
                    <div key={server.id} ref={setPickerRef(index)}>
                      <PresetPickerServerRow
                        server={server}
                        hovered={hoveredPickerIndex === index}
                        onHoverStart={() => setHoveredPickerIndex(index)}
                        onHoverEnd={() =>
                          setHoveredPickerIndex((current) => (current === index ? null : current))
                        }
                        onPick={() => {
                          onAddServer(server.id);
                          setHoveredPickerIndex(null);
                          scheduleRemeasure();
                        }}
                      />
                    </div>
                  ))
                )}

                <div ref={setBackRef}>
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={onCollapseAddServer}
                    style={addRowButtonStyle}
                  >
                    <span
                      style={{
                        width: 14,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: colors.muted,
                        flexShrink: 0,
                      }}
                      aria-hidden
                    >
                      <IoChevronUp size={14} />
                    </span>
                    <Text color={colors.foreground} fontSize={14} fontWeight="600" select="none">
                      Back
                    </Text>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ProjectAgentBranch = memo(ProjectAgentBranchInner);
