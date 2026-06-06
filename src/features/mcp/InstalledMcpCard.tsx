import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { IoChevronDown, IoChevronForward } from "../../icons";
import { Button, Input, Text, YStack } from "tamagui";
import { McpPanel } from "./McpPanel";
import {
  buildUpdatedMcpServer,
  getServerConfigValues,
  hasPendingRequiredConfig,
  resolveServerConfigInputs,
} from "../../services/mcp_installed/configState";
import { useMcpToolsSession } from "../../services/mcp_installed/useMcpToolsSession";
import { getRegistrySnapshot } from "../../services/mcp_registry/registryBridge";
import {
  addInstalledMcpServer,
  removeInstalledMcpServer,
  updateInstalledMcpServer,
} from "../../services/mcp_installed/api";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import { notifyMcpInstalled } from "../../services/mcp_installed/types";
import type { ConfigInput } from "../../services/mcp_registry/parser";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import { McpEnvVariablesInline, SectionLabel } from "./McpEnvVariablesInline";
import { compileMcpRunCommand } from "../../services/mcp_installed/api";
import {
  McpRunCommandsSection,
  mergeRunCommandsIntoValues,
  runCommandsFromValues,
} from "./McpRunCommandsSection";
import { McpRemoveButton } from "./McpRemoveButton";
import { McpServerTestSection } from "./McpServerTestSection";
import { McpToolsList } from "./McpToolsList";
import type { RunCommandsState } from "../../services/mcp_installed/runCommands";

type InstalledMcpCardProps = {
  server: InstalledMcpServer;
  onUpdated: () => void;
  onDeleted?: (serverId: number) => void;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  isNew?: boolean;
  onCreated?: () => void;
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
}: InstalledMcpCardProps) {
  const registryLoaded = getRegistrySnapshot().loading === false;
  const registryInputs = useMemo(
    () => resolveServerConfigInputs(server),
    [server, registryLoaded],
  );

  const [inputsOverride, setInputsOverride] = useState<ConfigInput[] | null>(null);
  const inputs = inputsOverride ?? registryInputs;
  const savedValues = useMemo(() => getServerConfigValues(server), [server]);
  const savedRunCommands = useMemo(
    () => runCommandsFromValues(savedValues, server.runCommand),
    [savedValues, server.runCommand],
  );

  const [newPhase, setNewPhase] = useState<NewServerPhase>(isNew ? "naming" : "editing");
  const [internalExpanded, setInternalExpanded] = useState(() => {
    if (isNew) {
      return false;
    }
    return defaultExpanded;
  });
  const isExpandedControlled = expandedProp !== undefined;
  const expanded = isExpandedControlled ? expandedProp : internalExpanded;

  const setExpanded = (next: boolean | ((value: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(expanded) : next;
    if (isExpandedControlled) {
      onExpandedChange?.(resolved);
    } else {
      setInternalExpanded(resolved);
    }
  };
  const [draftName, setDraftName] = useState(server.name);
  const [draftValues, setDraftValues] = useState<Record<string, string>>(savedValues);
  const [runCommands, setRunCommands] = useState<RunCommandsState>(savedRunCommands);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const {
    snapshot: toolsSnapshot,
    loading: toolsLoading,
    toolEnabled,
    toggleTool,
  } = useMcpToolsSession(server.id, expanded && server.id > 0);

  useEffect(() => {
    setDraftName(server.name);
    setDraftValues(savedValues);
    setRunCommands(savedRunCommands);
    setInputsOverride(null);
  }, [savedValues, savedRunCommands, server.name, server.id, server.runCommand]);

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
    if (hasPendingRequiredConfig(server, savedValues)) {
      autoExpandedForConfigRef.current = true;
      setExpanded(true);
    }
  }, [savedValues, server, isNew]);

  const isNaming = isNew && newPhase === "naming";
  const showExpandedBody = expanded && !isNaming;

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
    return JSON.stringify(draftValues) !== JSON.stringify(savedValues)
      || JSON.stringify(runCommands) !== JSON.stringify(savedRunCommands);
  }, [draftName, draftValues, isNew, newPhase, runCommands, savedRunCommands, savedValues, server.name]);

  const missingRequired = useMemo(
    () => hasPendingRequiredConfig(server, draftValues),
    [draftValues, server],
  );

  const packageInputs = useMemo(
    () => inputs.filter((input) => input.source !== "environment"),
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

  const handleSave = async () => {
    if (!isDirty || saving || isNaming) {
      return;
    }

    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setSaveError("Server name is required.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
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
        onCreated?.();
      }
      onUpdated();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleEnvChange = (values: Record<string, string>, nextInputs: ConfigInput[]) => {
    const merged = mergeRunCommandsIntoValues(values, runCommands);
    setDraftValues(merged);
    setInputsOverride(nextInputs);
  };

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

    setSaving(true);
    setSaveError(null);
    try {
      const compiledRun = await compileMcpRunCommand(mergedValues);
      const built = buildUpdatedMcpServer(server, mergedValues, nextInputs, {
        runCommand: compiledRun,
      });
      const saved = await updateInstalledMcpServer({
        ...built,
        name: draftName.trim() || server.name,
      });
      notifyMcpInstalled(saved);
      setInputsOverride(null);
      onUpdated();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleRunCommandsChange = (next: RunCommandsState) => {
    setRunCommands(next);
    setDraftValues((current) => mergeRunCommandsIntoValues(current, next));
  };

  const toggleExpanded = () => {
    if (isNaming) {
      return;
    }
    setExpanded(!expanded);
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

  return (
    <McpPanel
      p={0}
      overflow="hidden"
      width="100%"
      hoverStyle={{ borderColor: borders.focus }}
    >
      <div
        role={isNaming ? undefined : "button"}
        tabIndex={isNaming ? -1 : 0}
        onClick={toggleExpanded}
        onKeyDown={(event) => {
          if (isNaming) {
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
          cursor: isNaming ? "default" : "pointer",
          userSelect: "none",
        }}
      >
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
        ) : (
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
                void handleSave();
              }}
            >
              {saving ? "…" : isNew ? "Create" : "Save"}
            </Button>
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

      {showExpandedBody ? (
        <YStack
          px={12}
          pb={12}
          pt={2}
          gap={16}
          borderTopWidth={1}
          borderColor={borders.faint}
          onClick={(event) => event.stopPropagation()}
        >
          <McpRunCommandsSection
            state={runCommands}
            env={draftValues}
            onChange={handleRunCommandsChange}
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
                error={toolsSnapshot?.error}
                toolEnabled={toolEnabled}
                onToggleTool={toggleTool}
              />
              <McpServerTestSection serverId={server.id} />
            </>
          ) : null}

          {saveError ? (
            <Text color={colors.error} fontSize={11} select="none">
              {saveError}
            </Text>
          ) : null}

          {missingRequired ? (
            <Text color={colors.muted} fontSize={11} select="none">
              Fill required fields to use this server on the workspace graph.
        </Text>
          ) : null}

          {!registryLoaded && !isNew ? (
            <Text color={colors.muted} fontSize={11} select="none">
              Loading registry metadata…
        </Text>
          ) : null}
      </YStack>
      ) : null}
    </McpPanel>
  );
}
