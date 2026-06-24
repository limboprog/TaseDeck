import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { IoChevronDown, IoChevronForward, IoRefresh } from "../../icons";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { McpPanel } from "./McpPanel";
import {
  buildUpdatedMcpServer,
  canAttemptMcpTools,
  getServerConfigValues,
  getServerRunCommands,
  hasPendingRequiredConfig,
  resolveServerConfigInputs,
} from "../../services/mcp_installed/configState";
import { stopMcpServer } from "../../services/mcp_installed/toolsApi";
import { useMcpToolsSession } from "../../services/mcp_installed/useMcpToolsSession";
import {
  addInstalledMcpServer,
  analyzeMcpServer,
  removeInstalledMcpServer,
  updateInstalledMcpServer,
} from "../../services/mcp_installed/api";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import { notifyMcpInstalled } from "../../services/mcp_installed/types";
import { isMaskedSecretSaveError } from "../../services/mcp_installed/secretValues";
import type { ConfigInput } from "../../services/mcp_registry/parser";
import { usePanelChrome } from "../../preferences/usePanelChrome";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import {
  mcpExpandedCardBodyStyle,
  mcpExpandedCardCapStyle,
} from "./mcpCardChrome";
import { McpEnvVariablesInline, SectionLabel } from "./McpEnvVariablesInline";
import { compileMcpRunCommand } from "../../services/mcp_installed/api";
import {
  McpRunCommandsSection,
  mergeRunCommandsIntoValues,
} from "./McpRunCommandsSection";
import { McpRemoveButton } from "./McpRemoveButton";
import { McpServerTestSection } from "./McpServerTestSection";
import { McpToolsList } from "./McpToolsList";
import { McpOAuthSignInOverlay } from "./McpOAuthSignInOverlay";
import {
  disableMcpAuthPrompt,
  enableMcpAuthPrompt,
  isMcpAuthPromptEnabled,
} from "./mcpAuthPromptSession";
import {
  listenMcpOAuthSignInRequired,
  parseAuthRequiredError,
  type McpAuthChallenge,
} from "../../services/mcp_installed/oauthApi";
import type { McpServerAnalysis } from "../../services/mcp_installed";
import {
  getActiveRunCommandProfile,
  type RunCommandsState,
} from "../../services/mcp_installed/runCommands";
import {
  headerValuesFromRows,
  parseStoredHeaderRows,
  type HeaderVariableRow,
} from "../../services/mcp_installed/storedHeaders";
import {
  findScrollParent,
  preserveScrollWhile,
} from "./preserveScrollOnLayout";

type InstalledMcpCardProps = {
  server: InstalledMcpServer;
  onUpdated: () => void;
  onDeleted?: (serverId: number) => void;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  isNew?: boolean;
  onCreated?: (server: InstalledMcpServer) => void;
  /** Detail pane: always expanded, no collapse affordance. */
  detailMode?: boolean;
  /** Hide title row in detail pane (summary is shown above). */
  hideTitle?: boolean;
  /** Parent renders sticky header actions. */
  externalHeaderActions?: boolean;
  onDetailActionsChange?: (actions: InstalledMcpDetailActions | null) => void;
};

export type InstalledMcpDetailActions = {
  refresh: () => void;
  deleteServer: () => void;
  create: () => void;
  refreshing: boolean;
  saving: boolean;
  isNew: boolean;
  isNaming: boolean;
  canCreate: boolean;
  serverName: string;
};

type NewServerPhase = "naming" | "editing";

function ConfigField({
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

export function InstalledMcpCard({
  server,
  onUpdated,
  onDeleted,
  defaultExpanded = false,
  expanded: expandedProp,
  onExpandedChange,
  isNew = false,
  onCreated,
  detailMode = false,
  hideTitle = false,
  externalHeaderActions = false,
  onDetailActionsChange,
}: InstalledMcpCardProps) {
  const { surfaceStyle, borderColor } = usePanelChrome();
  const opaqueCardSurface = {
    ...surfaceStyle,
    background: colors.surface,
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
  };
  const [draftAnalysis, setDraftAnalysis] = useState<McpServerAnalysis | null>(null);
  const [liveAnalysis, setLiveAnalysis] = useState<McpServerAnalysis | null>(null);
  const analysis = server.analysis ?? draftAnalysis ?? liveAnalysis;
  const analysisHydratedFor = useRef<number | null>(null);

  const [inputsOverride, setInputsOverride] = useState<ConfigInput[] | null>(null);
  const [localServerPatch, setLocalServerPatch] = useState<InstalledMcpServer | null>(null);
  const lastFailedAutosaveHashRef = useRef<string | null>(null);
  const activeServer = localServerPatch ?? server;
  const inputs =
    inputsOverride ??
    analysis?.configInputs ??
    resolveServerConfigInputs(server, analysis ?? undefined);

  const baselineValues = useMemo(
    () => getServerConfigValues(activeServer),
    [activeServer.id, activeServer.updatedAt, activeServer.configValues, activeServer.jsonConfig],
  );
  const baselineRunCommands = useMemo(
    () => getServerRunCommands(activeServer),
    [
      activeServer.id,
      activeServer.updatedAt,
      activeServer.configValues,
      activeServer.jsonConfig,
      activeServer.runCommand,
    ],
  );

  useEffect(() => {
    setLocalServerPatch(null);
    lastFailedAutosaveHashRef.current = null;
  }, [server.id, server.updatedAt]);

  useEffect(() => {
    analysisHydratedFor.current = null;
  }, [server.id]);

  useEffect(() => {
    let cancelled = false;
    void analyzeMcpServer(server)
      .then((next) => {
        if (cancelled) {
          return;
        }
        if (server.id <= 0) {
          setDraftAnalysis(next);
        } else {
          setLiveAnalysis(next);
        }
      })
      .catch(() => {
        if (!cancelled && server.id <= 0) {
          setDraftAnalysis(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [server.id, server.jsonConfig]);

  useEffect(() => {
    const resolved = liveAnalysis ?? draftAnalysis;
    if (!resolved || analysisHydratedFor.current === server.id) {
      return;
    }
    analysisHydratedFor.current = server.id;
    setDraftValues(getServerConfigValues(server, resolved));
    if (resolved.runCommands.commands.length > 0) {
      setRunCommands(resolved.runCommands);
    }
    setInputsOverride(resolved.configInputs);
  }, [draftAnalysis, liveAnalysis, server]);

  const [newPhase, setNewPhase] = useState<NewServerPhase>(isNew ? "naming" : "editing");
  const [internalExpanded, setInternalExpanded] = useState(() => {
    if (detailMode) {
      return true;
    }
    if (isNew) {
      return false;
    }
    return defaultExpanded;
  });
  const isExpandedControlled = expandedProp !== undefined;
  const expanded = isExpandedControlled ? expandedProp : internalExpanded;
  const isNaming = isNew && newPhase === "naming";
  const showExpandedBody = (detailMode || expanded) && !isNaming;

  const setExpanded = (next: boolean | ((value: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(expanded) : next;
    if (isExpandedControlled) {
      onExpandedChange?.(resolved);
    } else {
      setInternalExpanded(resolved);
    }
  };
  const [draftName, setDraftName] = useState(server.name);
  const [draftValues, setDraftValues] = useState<Record<string, string>>(baselineValues);
  const [runCommands, setRunCommands] = useState<RunCommandsState>(baselineRunCommands);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cardRootRef = useRef<HTMLDivElement>(null);

  const sessionKey = useMemo(() => {
    const profile = getActiveRunCommandProfile(runCommands);
    if (!profile) {
      return "none";
    }
    return `${profile.id}:${profile.transport}:${profile.url ?? ""}:${profile.command ?? ""}`;
  }, [runCommands]);

  const canLoadTools = useMemo(
    () => canAttemptMcpTools(server, { values: draftValues, runCommands }),
    [draftValues, runCommands, server],
  );

  const toolsActive = showExpandedBody && canLoadTools;

  const {
    snapshot: toolsSnapshot,
    loading: toolsLoading,
    toolEnabled,
    toggleTool,
    refresh: refreshTools,
  } = useMcpToolsSession(server.id, toolsActive, sessionKey);

  const [authChallenge, setAuthChallenge] = useState<McpAuthChallenge | null>(null);
  const [authDismissed, setAuthDismissed] = useState(false);

  const showOAuthOverlay =
    authChallenge?.flow === "oauth" &&
    !authDismissed &&
    isMcpAuthPromptEnabled(server.id);

  const openAuthChallenge = (challenge: McpAuthChallenge) => {
    if (challenge.flow !== "oauth") {
      return;
    }
    setAuthDismissed(false);
    setAuthChallenge(challenge);
  };

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
  }, [server.id]);

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

  useEffect(() => {
    if (localServerPatch != null) {
      return;
    }
    setDraftName(server.name);
    setDraftValues(baselineValues);
    setRunCommands(baselineRunCommands);
    setInputsOverride(null);
  }, [baselineRunCommands, baselineValues, localServerPatch, server.id, server.name, server.updatedAt]);

  useEffect(() => {
    if (isNew && newPhase === "naming") {
      nameInputRef.current?.focus();
    }
  }, [isNew, newPhase]);

  const autoExpandedForConfigRef = useRef(false);

  useEffect(() => {
    if (isNew || autoExpandedForConfigRef.current) {
      return;
    }
    if (hasPendingRequiredConfig(server, baselineValues, baselineRunCommands)) {
      autoExpandedForConfigRef.current = true;
      setExpanded(true);
    }
  }, [baselineRunCommands, baselineValues, server, isNew]);

  const isDirty = useMemo(() => {
    if (isNew && newPhase === "naming") {
      return false;
    }
    if (isNew) {
      return true;
    }
    if (draftName.trim() !== server.name.trim()) {
      return true;
    }
    return JSON.stringify(draftValues) !== JSON.stringify(baselineValues)
      || JSON.stringify(runCommands) !== JSON.stringify(baselineRunCommands);
  }, [baselineRunCommands, baselineValues, draftName, draftValues, isNew, newPhase, runCommands, server.name]);

  const missingRequired = useMemo(
    () => hasPendingRequiredConfig(server, draftValues, runCommands),
    [draftValues, runCommands, server],
  );

  const packageInputs = useMemo(
    () => inputs.filter((input) => input.source === "argument"),
    [inputs],
  );

  const commitServerName = () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      return;
    }
    setDraftName(trimmed);
    if (isNew) {
      setNewPhase("editing");
      setExpanded(true);
    }
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitServerName();
    }
  };

  const persistServerConfig = async (): Promise<InstalledMcpServer | null> => {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setSaveError("Server name is required.");
      return null;
    }

    const mergedValues = mergeRunCommandsIntoValues(draftValues, runCommands);
    const compiledRun = await compileMcpRunCommand(mergedValues);
    const built = buildUpdatedMcpServer(server, mergedValues, inputs, {
      runCommand: compiledRun,
    });
    const updated = {
      ...built,
      name: trimmedName,
    };
    const saved = isNew
      ? await addInstalledMcpServer(updated)
      : await updateInstalledMcpServer(updated);
    notifyMcpInstalled(saved);
    setInputsOverride(null);
    if (isNew) {
      onCreated?.(saved);
    }
    onUpdated();
    return saved;
  };

  const handleCreate = async () => {
    if (!isNew || !isDirty || saving || isNaming) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const saved = await persistServerConfig();
      if (!saved) {
        return;
      }
      setAuthChallenge(null);
      setAuthDismissed(false);
      if (saved.id > 0) {
        enableMcpAuthPrompt(saved.id);
        void stopMcpServer(saved.id).then(() => {
          void refreshTools();
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (!isMaskedSecretSaveError(message)) {
        setSaveError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    if (isNew || server.id <= 0 || refreshing || saving || isNaming) {
      return;
    }

    enableMcpAuthPrompt(server.id);
    setAuthDismissed(false);
    setRefreshing(true);
    setSaveError(null);
    try {
      if (isDirty) {
        const currentInputs = inputsOverride ?? inputs;
        await saveServerDraft(draftValues, currentInputs);
      }
      await refreshTools();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (!isMaskedSecretSaveError(message)) {
        setSaveError(message);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleEnvChange = (values: Record<string, string>, nextInputs: ConfigInput[]) => {
    const merged = mergeRunCommandsIntoValues(values, runCommands);
    setDraftValues(merged);
    setInputsOverride(nextInputs);
  };

  const saveServerDraft = useCallback(
    async (
      values: Record<string, string>,
      nextInputs: ConfigInput[],
      options?: { autosave?: boolean },
    ): Promise<InstalledMcpServer | null> => {
      if (server.id <= 0) {
        return null;
      }

      if (!options?.autosave) {
        setSaving(true);
      }
      setSaveError(null);
      try {
        const mergedValues = mergeRunCommandsIntoValues(values, runCommands);
        const compiledRun = await compileMcpRunCommand(mergedValues);
        const built = buildUpdatedMcpServer(activeServer, mergedValues, nextInputs, {
          runCommand: compiledRun,
        });
        const saved = await updateInstalledMcpServer({
          ...built,
          name: draftName.trim() || activeServer.name,
        });
        setInputsOverride(null);

        if (options?.autosave) {
          lastFailedAutosaveHashRef.current = null;
          setLocalServerPatch(saved);
          return saved;
        }

        setLocalServerPatch(null);
        notifyMcpInstalled(saved);
        onUpdated();
        return saved;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (!options?.autosave && !isMaskedSecretSaveError(message)) {
          setSaveError(message);
        }
        return null;
      } finally {
        if (!options?.autosave) {
          setSaving(false);
        }
      }
    },
    [activeServer, draftName, onUpdated, runCommands, server.id],
  );

  const saveServerDraftRef = useRef(saveServerDraft);
  saveServerDraftRef.current = saveServerDraft;

  const persistEnvChanges = async (
    values: Record<string, string>,
    nextInputs: ConfigInput[],
  ) => {
    const mergedValues = mergeRunCommandsIntoValues(values, runCommands);
    setDraftValues(mergedValues);
    setInputsOverride(nextInputs);

    if (server.id <= 0) {
      return;
    }

    await saveServerDraft(mergedValues, nextInputs);
  };

  const handleRunCommandsChange = (next: RunCommandsState) => {
    setRunCommands(next);
    setDraftValues((current) => mergeRunCommandsIntoValues(current, next));
  };

  const draftAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isNew || server.id <= 0 || isNaming || !isDirty || saving) {
      return;
    }

    const autosaveHash = JSON.stringify({
      draftName: draftName.trim(),
      draftValues,
      runCommands,
    });
    if (autosaveHash === lastFailedAutosaveHashRef.current) {
      return;
    }

    if (draftAutosaveTimerRef.current) {
      clearTimeout(draftAutosaveTimerRef.current);
    }

    draftAutosaveTimerRef.current = setTimeout(() => {
      draftAutosaveTimerRef.current = null;
      const currentInputs = inputsOverride ?? inputs;
      void saveServerDraftRef.current(draftValues, currentInputs, { autosave: true }).then((saved) => {
        if (!saved) {
          lastFailedAutosaveHashRef.current = autosaveHash;
        }
      });
    }, 500);

    return () => {
      if (draftAutosaveTimerRef.current) {
        clearTimeout(draftAutosaveTimerRef.current);
      }
    };
  }, [
    draftName,
    draftValues,
    inputs,
    inputsOverride,
    isDirty,
    isNaming,
    isNew,
    runCommands,
    saving,
    server.id,
  ]);

  const headerRows = useMemo(
    () => parseStoredHeaderRows(draftValues),
    [draftValues],
  );

  const handleHeadersChange = (rows: HeaderVariableRow[]) => {
    setDraftValues((current) =>
      headerValuesFromRows(mergeRunCommandsIntoValues(current, runCommands), rows),
    );
  };

  const toggleExpanded = () => {
    if (isNaming) {
      return;
    }
    const scrollParent = findScrollParent(cardRootRef.current);
    preserveScrollWhile(scrollParent, cardRootRef.current, () => {
      setExpanded(!expanded);
    });
  };

  const handleDelete = async () => {
    if (isNew || server.id <= 0) {
      return;
    }

    setSaveError(null);
    setSaving(true);
    try {
      await removeInstalledMcpServer(server.id);
      onDeleted?.(server.id);
      onUpdated();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!detailMode || !externalHeaderActions || !onDetailActionsChange) {
      return;
    }

    onDetailActionsChange({
      refresh: () => {
        void handleRefresh();
      },
      deleteServer: () => {
        void handleDelete();
      },
      create: () => {
        void handleCreate();
      },
      refreshing,
      saving,
      isNew,
      isNaming,
      canCreate: isNew && isDirty && !saving && !isNaming,
      serverName: draftName.trim() || server.name,
    });

    return () => {
      onDetailActionsChange(null);
    };
  }, [
    detailMode,
    draftName,
    externalHeaderActions,
    isDirty,
    isNaming,
    isNew,
    onDetailActionsChange,
    refreshing,
    saving,
    server.name,
  ]);

  const headerRow = (
      <div
        role={detailMode || isNaming ? undefined : "button"}
        tabIndex={detailMode || isNaming ? -1 : 0}
        onClick={detailMode ? undefined : toggleExpanded}
        onKeyDown={(event) => {
          if (detailMode || isNaming) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleExpanded();
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          cursor: detailMode || isNaming ? "default" : "pointer",
          userSelect: "none",
        }}
      >
        {!detailMode ? (
          <div
            style={{
              color: colors.muted,
              flexShrink: 0,
              display: "flex",
              opacity: isNaming ? 0.35 : 1,
              pointerEvents: isNaming ? "none" : "auto",
            }}
            aria-hidden={isNaming}
          >
            {expanded && !isNaming ? (
              <IoChevronDown size={15} />
            ) : (
              <IoChevronForward size={15} />
            )}
          </div>
        ) : null}

        {isNaming ? (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              height: 32,
              padding: "0 10px",
              borderRadius: 8,
              border: `1px solid ${tamaguiSurfaces.controlBorder}`,
              background: tamaguiSurfaces.controlBg,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              ref={nameInputRef}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitServerName}
              onKeyDown={handleNameKeyDown}
              placeholder="Enter MCP server name..."
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                color: colors.foreground,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "inherit",
              }}
            />
          </div>
        ) : hideTitle ? null : (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              color: colors.foreground,
              fontSize: 14,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {draftName.trim() || "Untitled server"}
          </div>
        )}

        {missingRequired && !showExpandedBody && !isNaming ? (
          <span style={{ color: colors.warning, fontSize: 10, flexShrink: 0 }}>Setup</span>
        ) : null}

        {!isNaming ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {isNew ? (
              <Button
                size="$2"
                height={26}
                px={10}
                rounded={6}
                disabled={!isDirty || saving}
                opacity={isDirty ? 1 : 0.35}
                bg={isDirty ? colors.accent : tamaguiSurfaces.controlHoverBg}
                color={isDirty ? "#fff" : colors.muted}
                fontSize={11}
                onPress={() => {
                  void handleCreate();
                }}
              >
                {saving ? "…" : "Create"}
              </Button>
            ) : (
              <Button
                unstyled
                width={30}
                height={30}
                rounded={8}
                hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
                disabled={refreshing || saving}
                opacity={refreshing || saving ? 0.45 : 1}
                onPress={() => {
                  void handleRefresh();
                }}
                aria-label="Refresh server"
              >
                <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
                  <IoRefresh size={16} />
                </XStack>
              </Button>
            )}
            {!isNew && server.id > 0 ? (
              <McpRemoveButton
                ariaLabel={`Delete ${draftName.trim() || server.name}`}
                onClick={() => {
                  void handleDelete();
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
  );

  const expandedBody = showExpandedBody ? (
        <YStack
          px={detailMode ? 0 : 12}
          pb={detailMode ? 0 : 12}
          pt={detailMode ? 0 : 2}
          gap={16}
          onClick={(event) => event.stopPropagation()}
        >
          <McpRunCommandsSection
            state={runCommands}
            env={draftValues}
            headers={headerRows}
            onChange={handleRunCommandsChange}
            onHeadersChange={handleHeadersChange}
          />

          <McpEnvVariablesInline
            resetKey={`${server.id}:${server.updatedAt}`}
            baseInputs={inputs}
            values={draftValues}
            onChange={handleEnvChange}
            onPersist={(mergedValues, mergedInputs) => persistEnvChanges(mergedValues, mergedInputs)}
          />

          {packageInputs.length > 0 ? (
            <YStack gap={8}>
              <SectionLabel>Package settings</SectionLabel>
              {packageInputs.map((input) => (
                <ConfigField
                  key={input.id}
                  input={input}
                  value={draftValues[input.id] ?? draftValues[input.name] ?? ""}
                  onChange={(value) =>
                    setDraftValues((current) => {
                      const next = { ...current, [input.id]: value, [input.name]: value };
                      return mergeRunCommandsIntoValues(next, runCommands);
                    })
                  }
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
                toolEnabled={toolEnabled}
                onToggleTool={toggleTool}
                showToggles={false}
              />
              <McpServerTestSection
                serverId={server.id}
                disabled={!canLoadTools}
                resetKey={sessionKey}
                onAuthRequired={openAuthChallenge}
              />
            </>
          ) : null}

          {saveError ? (
            <Text color={colors.error} fontSize={11} select="none">
              {saveError}
            </Text>
          ) : null}

      </YStack>
  ) : null;

  const showDetailActions = detailMode && !externalHeaderActions;
  const detailActionRow =
    showDetailActions && !isNaming ? (
      <XStack width="100%" justify="flex-end" items="center" gap={4} pb={4}>
        {isNew ? (
          <Button
            size="$2"
            height={26}
            px={10}
            rounded={6}
            disabled={!isDirty || saving}
            opacity={isDirty ? 1 : 0.35}
            bg={isDirty ? colors.accent : tamaguiSurfaces.controlHoverBg}
            color={isDirty ? "#fff" : colors.muted}
            fontSize={11}
            onPress={() => {
              void handleCreate();
            }}
          >
            {saving ? "…" : "Create"}
          </Button>
        ) : (
          <>
            <Button
              unstyled
              width={30}
              height={30}
              rounded={8}
              hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
              disabled={refreshing || saving}
              opacity={refreshing || saving ? 0.45 : 1}
              onPress={() => {
                void handleRefresh();
              }}
              aria-label="Refresh server"
            >
              <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
                <IoRefresh size={16} />
              </XStack>
            </Button>
            {server.id > 0 ? (
              <McpRemoveButton
                ariaLabel={`Delete ${draftName.trim() || server.name}`}
                onClick={() => {
                  void handleDelete();
                }}
              />
            ) : null}
          </>
        )}
      </XStack>
    ) : null;

  return (
    <div ref={cardRootRef} style={{ width: "100%" }}>
      {detailMode && showExpandedBody ? (
        <YStack gap={16} width="100%">
          {isNaming ? (
            <div style={{ padding: 0 }}>{headerRow}</div>
          ) : (
            detailActionRow
          )}
          {expandedBody}
        </YStack>
      ) : showExpandedBody ? (
        <McpPanel
          p={0}
          clip={false}
          overflow="visible"
          borderWidth={0}
          bg="transparent"
          width="100%"
        >
          <div style={mcpExpandedCardCapStyle(borderColor, opaqueCardSurface)}>
            {headerRow}
          </div>
          <div style={mcpExpandedCardBodyStyle(borderColor, opaqueCardSurface)}>
            {expandedBody}
          </div>
        </McpPanel>
      ) : (
        <McpPanel
          p={0}
          overflow="hidden"
          width="100%"
          hoverStyle={{ borderColor: borders.focus }}
        >
          {headerRow}
        </McpPanel>
      )}

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
    </div>
  );
}
