import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IoChevronForward, IoPlayOutline } from "../../icons";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { PaneIconMenu, type PaneIconMenuRow } from "../../components/pane/PaneIconMenu";
import { paneCompactActionStyle } from "../../components/pane/paneStyles";
import { borders, colors, project, tamaguiSurfaces } from "../../theme";
import {
  canAttemptMcpTools,
  getServerConfigValues,
  resolveServerConfigInputs,
} from "../../services/mcp_installed/configState";
import {
  fetchRegistryEntryForInstalled,
  resolveRegistryEntryFromInstalled,
} from "../../services/mcp_installed";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import {
  listenMcpOAuthSignInRequired,
  parseAuthRequiredError,
  type McpAuthChallenge,
} from "../../services/mcp_installed/oauthApi";
import { getActiveRunCommandProfile } from "../../services/mcp_installed/runCommands";
import { stopMcpServer } from "../../services/mcp_installed/toolsApi";
import { useMcpToolsSession } from "../../services/mcp_installed/useMcpToolsSession";
import type { ConfigInput } from "../../services/mcp_registry/parser";
import { headerValuesFromRows, parseStoredHeaderRows } from "../../services/mcp_installed/storedHeaders";
import type { HeaderVariableRow } from "../../services/mcp_installed/storedHeaders";
import { McpEnvVariablesInline, SectionLabel } from "../mcp/McpEnvVariablesInline";
import {
  mergeRunCommandsIntoValues,
  McpRunCommandsSection,
} from "../mcp/McpRunCommandsSection";
import { McpOAuthSignInOverlay } from "../mcp/McpOAuthSignInOverlay";
import { disableMcpAuthPrompt, enableMcpAuthPrompt, isMcpAuthPromptEnabled } from "../mcp/mcpAuthPromptSession";
import { McpServerTestSection, type McpServerTestSectionHandle } from "../mcp/McpServerTestSection";
import { McpToolsList } from "../mcp/McpToolsList";
import {
  findScrollParent,
  preserveScrollWhile,
} from "../mcp/preserveScrollOnLayout";
import {
  mergeServerRunCommands,
  type ProjectConfigOverrides,
  type ProjectServerOverridePatch,
} from "../../services/projects/projectOverrides";
import { McpListCardKindBadge } from "../mcp/McpListCardKindBadge";
import { getInstalledServerKind } from "../mcp/mcpListCardKind";
import { DEFAULT_MCP_SERVER_DESCRIPTION, getInstalledServerTitle } from "../mcp/mcpServerSummary";
import { resolveInstalledListDescription } from "../mcp/mcpDescriptionCache";
import { PROJECT_SERVER_EXPAND_RIGHT } from "./projectLayout";

const CARD_RADIUS = 12;

function overridePatchesEqual(
  left: ProjectServerOverridePatch,
  right: ProjectServerOverridePatch,
): boolean {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

type ProjectServerConfigCardProps = {
  serverKey: string;
  server: InstalledMcpServer;
  committedPatch?: ProjectServerOverridePatch;
  draftPatch?: ProjectServerOverridePatch;
  onDraftOverrideChange: (patch: ProjectServerOverridePatch) => void;
  onSaveToProject: (patch: ProjectServerOverridePatch) => void;
  onResetDraft: () => void;
  toolsHistoryToken?: number;
  onRemove?: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

function PackageConfigField({
  input,
  value,
  onChange,
}: {
  input: ConfigInput;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <YStack gap={4}>
      <Text color={colors.foreground} fontSize={12} fontWeight="600" select="none">
        {input.name}
        {input.isRequired ? (
          <Text color={colors.error} select="none">
            {" "}
            *
          </Text>
        ) : null}
      </Text>
      {input.description ? (
        <Text color={colors.muted} fontSize={11} lineHeight={16} select="none">
          {input.description}
        </Text>
      ) : null}
      <Input
        value={value}
        onChangeText={onChange}
        secureTextEntry={input.isSecret}
        placeholder={input.placeholder ?? `Enter ${input.name}`}
        color={colors.foreground}
        placeholderTextColor={colors.muted as never}
        bg={tamaguiSurfaces.controlBg}
        borderWidth={1}
        borderColor={tamaguiSurfaces.controlBorder}
        rounded={6}
        px={10}
        py={7}
        fontSize={12}
      />
    </YStack>
  );
}

type ProjectServerConfigCardBodyProps = {
  serverKey: string;
  server: InstalledMcpServer;
  localPatch: ProjectServerOverridePatch;
  onDraftChange: (patch: ProjectServerOverridePatch) => void;
  toolsHistoryToken?: number;
  expanded: boolean;
};

function ProjectServerConfigCardBody({
  serverKey,
  server,
  localPatch,
  onDraftChange,
  toolsHistoryToken = 0,
  expanded,
}: ProjectServerConfigCardBodyProps) {
  const baseInputs = useMemo(() => resolveServerConfigInputs(server), [server]);
  const baselineValues = useMemo(() => getServerConfigValues(server), [server]);
  const overridesForServer = useMemo(
    (): ProjectConfigOverrides => ({ [serverKey]: localPatch }),
    [localPatch, serverKey],
  );

  const envValues = useMemo(() => {
    const patch = localPatch.env ?? {};
    return { ...baselineValues, ...patch };
  }, [baselineValues, localPatch.env]);

  const runCommands = useMemo(
    () => mergeServerRunCommands(server, overridesForServer, serverKey),
    [overridesForServer, server, serverKey],
  );

  const headerRows = useMemo(() => parseStoredHeaderRows(envValues), [envValues]);

  const packageInputs = useMemo(
    () => baseInputs.filter((input) => input.source === "argument"),
    [baseInputs],
  );

  const sessionKey = useMemo(() => {
    const profile = getActiveRunCommandProfile(runCommands);
    if (!profile) {
      return `${serverKey}:none`;
    }
    return `${serverKey}:${profile.id}:${profile.transport}:${profile.url ?? ""}:${profile.command ?? ""}`;
  }, [runCommands, serverKey]);

  const canLoadTools = useMemo(
    () => canAttemptMcpTools(server, { values: envValues, runCommands }),
    [envValues, runCommands, server],
  );

  const [toolsSessionActive, setToolsSessionActive] = useState(false);

  useEffect(() => {
    if (expanded) {
      setToolsSessionActive(true);
    }
  }, [expanded]);

  const {
    snapshot: toolsSnapshot,
    loading: toolsLoading,
    refresh: refreshTools,
  } = useMcpToolsSession(
    server.id,
    expanded && toolsSessionActive && canLoadTools,
    sessionKey,
    toolsHistoryToken,
  );

  const displayToolEnabled = useMemo(() => {
    const prefs = localPatch.toolPrefs ?? {};
    const map: Record<string, boolean> = {};
    for (const tool of toolsSnapshot?.tools ?? []) {
      map[tool.name] = prefs[tool.name] !== false;
    }
    return map;
  }, [localPatch.toolPrefs, toolsSnapshot?.tools]);

  const handleToggleTool = useCallback(
    (toolName: string, enabled: boolean) => {
      onDraftChange({
        ...localPatch,
        toolPrefs: { ...(localPatch.toolPrefs ?? {}), [toolName]: enabled },
      });
    },
    [localPatch, onDraftChange],
  );

  const [authChallenge, setAuthChallenge] = useState<McpAuthChallenge | null>(null);
  const [authDismissed, setAuthDismissed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const testSectionRef = useRef<McpServerTestSectionHandle | null>(null);

  const showOAuthOverlay =
    authChallenge?.flow === "oauth" &&
    !authDismissed &&
    isMcpAuthPromptEnabled(server.id);

  const openAuthChallenge = useCallback((challenge: McpAuthChallenge) => {
    if (challenge.flow !== "oauth") {
      return;
    }
    setAuthDismissed(false);
    setAuthChallenge(challenge);
  }, []);

  useEffect(() => {
    if (server.id <= 0) {
      return;
    }
    let unlisten: (() => void) | undefined;
    void listenMcpOAuthSignInRequired(server.id, (challenge) => {
      if (isMcpAuthPromptEnabled(server.id)) {
        openAuthChallenge(challenge);
      }
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      unlisten?.();
    };
  }, [openAuthChallenge, server.id]);

  useEffect(() => {
    const fromError = parseAuthRequiredError(toolsSnapshot?.error);
    if (
      fromError &&
      fromError.flow === "oauth" &&
      !authDismissed &&
      isMcpAuthPromptEnabled(server.id)
    ) {
      setAuthChallenge(fromError);
    }
  }, [authDismissed, server.id, toolsSnapshot?.error]);

  useEffect(() => {
    if (!parseAuthRequiredError(toolsSnapshot?.error) && toolsSnapshot?.error == null) {
      setAuthChallenge(null);
    }
  }, [toolsSnapshot?.error, toolsSnapshot?.tools]);

  const handlePlay = async () => {
    if (server.id <= 0 || playing || toolsLoading) {
      return;
    }

    enableMcpAuthPrompt(server.id);
    setAuthDismissed(false);
    setToolsSessionActive(true);
    setPlaying(true);
    try {
      await stopMcpServer(server.id);
      await refreshTools();
      await testSectionRef.current?.runAll();
    } finally {
      setPlaying(false);
    }
  };

  const handleEnvChange = (nextValues: Record<string, string>) => {
    onDraftChange({ ...localPatch, env: nextValues });
  };

  const handleRunCommandsChange = (next: typeof runCommands) => {
    onDraftChange({ ...localPatch, runCommands: next });
  };

  const handleHeadersChange = (rows: HeaderVariableRow[]) => {
    const nextValues = headerValuesFromRows(mergeRunCommandsIntoValues(envValues, runCommands), rows);
    onDraftChange({ ...localPatch, env: nextValues });
  };

  return (
    <>
      <div
        style={{
          marginLeft: 0,
          width: `calc(100% + ${PROJECT_SERVER_EXPAND_RIGHT}px)`,
          borderTopLeftRadius: 0,
          borderTopRightRadius: CARD_RADIUS,
          borderBottomLeftRadius: CARD_RADIUS,
          borderBottomRightRadius: CARD_RADIUS,
          border: `1px solid ${borders.faint}`,
          borderTop: "none",
          background: project.nodeFunctional,
          padding: "12px 16px 16px",
          boxSizing: "border-box",
          overflow: "visible",
        }}
      >
        <YStack gap={16} width="100%" minW={0} onClick={(event) => event.stopPropagation()}>
          <McpRunCommandsSection
            state={runCommands}
            env={envValues}
            headers={headerRows}
            onChange={handleRunCommandsChange}
            onHeadersChange={handleHeadersChange}
            headerTrailing={
              server.id > 0 ? (
                <Button
                  unstyled
                  width={30}
                  height={30}
                  rounded={8}
                  hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
                  disabled={playing || toolsLoading || !canLoadTools}
                  opacity={playing || toolsLoading || !canLoadTools ? 0.45 : 1}
                  onPress={() => {
                    void handlePlay();
                  }}
                  aria-label="Run connection and tests"
                >
                  <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
                    <IoPlayOutline size={16} />
                  </XStack>
                </Button>
              ) : undefined
            }
          />

          <McpEnvVariablesInline
            resetKey={`${server.id}:${server.updatedAt}:${serverKey}`}
            baseInputs={baseInputs}
            values={envValues}
            onChange={handleEnvChange}
            onPersist={async (mergedValues) => {
              handleEnvChange(mergedValues);
            }}
          />

          {packageInputs.length > 0 ? (
            <YStack gap={8}>
              <SectionLabel>Package settings</SectionLabel>
              {packageInputs.map((input) => (
                <PackageConfigField
                  key={input.id}
                  input={input}
                  value={envValues[input.id] ?? envValues[input.name] ?? ""}
                  onChange={(value) => {
                    const next = { ...envValues, [input.id]: value, [input.name]: value };
                    handleEnvChange(mergeRunCommandsIntoValues(next, runCommands));
                  }}
                />
              ))}
            </YStack>
          ) : null}

          {server.id > 0 ? (
            <>
              <McpToolsList
                tools={toolsSnapshot?.tools ?? []}
                loading={toolsLoading}
                error={
                  showOAuthOverlay || parseAuthRequiredError(toolsSnapshot?.error)
                    ? null
                    : toolsSnapshot?.error
                }
                toolEnabled={displayToolEnabled}
                onToggleTool={handleToggleTool}
              />
              <McpServerTestSection
                ref={testSectionRef}
                serverId={server.id}
                disabled={!canLoadTools}
                resetKey={sessionKey}
                onAuthRequired={openAuthChallenge}
              />
            </>
          ) : null}
        </YStack>
      </div>

      {showOAuthOverlay && authChallenge ? (
        <McpOAuthSignInOverlay
          challenge={authChallenge}
          onClose={() => {
            setAuthDismissed(true);
            setAuthChallenge(null);
            disableMcpAuthPrompt(server.id);
          }}
          onAuthenticated={() => {
            setAuthDismissed(false);
            setAuthChallenge(null);
            disableMcpAuthPrompt(server.id);
            void refreshTools();
          }}
        />
      ) : null}
    </>
  );
}

function ProjectServerConfigCardInner({
  serverKey,
  server,
  committedPatch,
  draftPatch,
  onDraftOverrideChange,
  onSaveToProject,
  onResetDraft,
  toolsHistoryToken,
  onRemove,
  expanded: expandedProp,
  onExpandedChange,
}: ProjectServerConfigCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp ?? internalExpanded;
  const setExpanded = onExpandedChange ?? setInternalExpanded;
  const cardRootRef = useRef<HTMLDivElement | null>(null);
  const registryEntry = resolveRegistryEntryFromInstalled(server);

  useEffect(() => {
    void fetchRegistryEntryForInstalled(server);
  }, [server]);

  const kind = getInstalledServerKind(server, registryEntry);
  const title = getInstalledServerTitle(server, registryEntry);
  const description =
    resolveInstalledListDescription(server.id, registryEntry) || DEFAULT_MCP_SERVER_DESCRIPTION;

  const committed = useMemo(() => committedPatch ?? {}, [committedPatch]);
  const effectivePatch = useMemo(
    () => (draftPatch !== undefined ? draftPatch : committed),
    [committed, draftPatch],
  );
  const [localPatch, setLocalPatch] = useState<ProjectServerOverridePatch>(effectivePatch);
  const onDraftOverrideChangeRef = useRef(onDraftOverrideChange);
  onDraftOverrideChangeRef.current = onDraftOverrideChange;
  const onSaveToProjectRef = useRef(onSaveToProject);
  onSaveToProjectRef.current = onSaveToProject;

  useEffect(() => {
    setLocalPatch(effectivePatch);
  }, [effectivePatch, server.id, serverKey, toolsHistoryToken]);

  const isDirty = useMemo(
    () => !overridePatchesEqual(localPatch, committed),
    [committed, localPatch],
  );

  const updateDraft = useCallback((next: ProjectServerOverridePatch) => {
    setLocalPatch(next);
    onDraftOverrideChangeRef.current(next);
  }, []);

  const handleSave = useCallback(() => {
    if (!isDirty) {
      return;
    }
    onSaveToProjectRef.current(localPatch);
  }, [isDirty, localPatch]);

  const toggleExpanded = () => {
    const scrollParent = findScrollParent(cardRootRef.current);
    preserveScrollWhile(scrollParent, cardRootRef.current, () => {
      setExpanded(!expanded);
    });
  };

  const serverMenuRows = useMemo((): PaneIconMenuRow[] => {
    const rows: PaneIconMenuRow[] = [
      {
        type: "item",
        key: "reset",
        label: "Reset",
        onPick: onResetDraft,
      },
    ];
    if (onRemove) {
      rows.push({
        type: "item",
        key: "delete",
        label: "Delete",
        danger: true,
        icon: "trash",
        onPick: onRemove,
      });
    }
    return rows;
  }, [onRemove, onResetDraft]);

  return (
    <div ref={cardRootRef} style={{ width: "100%", position: "relative", overflow: "visible" }}>
      <div
        style={{
          width: "100%",
          borderRadius: expanded ? `${CARD_RADIUS}px ${CARD_RADIUS}px 0 0` : CARD_RADIUS,
          border: `1px solid ${borders.faint}`,
          ...(expanded ? { borderBottom: "none" } : {}),
          background: project.nodeFunctional,
          padding: "12px 12px 0",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
          <McpListCardKindBadge kind={kind} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text color={colors.foreground} fontSize={14} fontWeight="600" numberOfLines={1} select="none">
              {title}
            </Text>
            <Text
              color={colors.muted}
              fontSize={11}
              lineHeight={17}
              mt={5}
              select="none"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: expanded ? undefined : 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {description}
            </Text>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
            borderTop: `1px solid ${borders.faint}`,
            minHeight: 28,
            paddingBottom: expanded ? 0 : 10,
          }}
        >
          <button
            type="button"
            aria-label={expanded ? "Collapse server settings" : "Expand server settings"}
            aria-expanded={expanded}
            onClick={toggleExpanded}
            style={{
              flex: 1,
              minHeight: 28,
              padding: "6px 0 0",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 4,
              color: colors.muted,
              fontSize: 11,
              fontWeight: 500,
              fontFamily: "inherit",
              lineHeight: 1,
              minWidth: 0,
            }}
          >
            <IoChevronForward
              size={13}
              style={{
                flexShrink: 0,
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            />
            <span style={{ userSelect: "none" }}>More</span>
          </button>
          {expanded ? (
            <button
              type="button"
              aria-label="Save server configuration"
              disabled={!isDirty}
              onClick={handleSave}
              onMouseEnter={(event) => {
                if (!isDirty) {
                  return;
                }
                event.currentTarget.style.background = "#9D6FF8";
              }}
              onMouseLeave={(event) => {
                if (!isDirty) {
                  return;
                }
                event.currentTarget.style.background = colors.accent;
              }}
              style={paneCompactActionStyle({ accent: true, disabled: !isDirty })}
            >
              Save
            </button>
          ) : null}
          <div style={{ flexShrink: 0 }} onClick={(event) => event.stopPropagation()}>
            <PaneIconMenu ariaLabel="Server actions" rows={serverMenuRows} />
          </div>
        </div>
      </div>

      {expanded ? (
        <ProjectServerConfigCardBody
          serverKey={serverKey}
          server={server}
          localPatch={localPatch}
          onDraftChange={updateDraft}
          toolsHistoryToken={toolsHistoryToken}
          expanded={expanded}
        />
      ) : null}
    </div>
  );
}

export const ProjectServerConfigCard = memo(
  ProjectServerConfigCardInner,
  (left, right) =>
    left.serverKey === right.serverKey &&
    left.server.id === right.server.id &&
    left.server.updatedAt === right.server.updatedAt &&
    left.committedPatch === right.committedPatch &&
    left.draftPatch === right.draftPatch &&
    left.toolsHistoryToken === right.toolsHistoryToken &&
    left.expanded === right.expanded &&
    left.onRemove === right.onRemove &&
    left.onDraftOverrideChange === right.onDraftOverrideChange &&
    left.onSaveToProject === right.onSaveToProject &&
    left.onResetDraft === right.onResetDraft &&
    left.onExpandedChange === right.onExpandedChange,
);
