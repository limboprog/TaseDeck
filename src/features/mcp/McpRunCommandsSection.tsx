import { useMemo, useRef, useState } from "react";
import { YStack } from "tamagui";
import {
  RUN_COMMANDS_CONFIG_KEY,
  TRANSPORT_LABELS,
  compileRunCommandShell,
  createEmptyRunCommand,
  createEmptyRunCommandArg,
  normalizeRunCommandsState,
  type RunCommandArg,
  type RunCommandProfile,
  type RunCommandTransport,
  type RunCommandsState,
} from "../../services/mcp_installed/runCommands";
import { parseStoredEnvRows } from "../../services/mcp_installed/storedEnv";
import { colors } from "../../theme";
import { EnvTemplateInput } from "./EnvTemplateInput";
import { SectionLabel } from "./McpEnvVariablesInline";
import { McpSectionHeader } from "./McpSectionHeader";
import { mcpBlackBlock } from "./mcpTableStyles";
import { McpDataTable, McpTableRow } from "./table/McpDataTable";
import {
  McpTableAddHeader,
  McpTableCell,
  McpTableEditableText,
  McpTableEmptyRow,
  McpTableHeaderCopy,
  McpTableHeaderLabel,
  McpTablePickerSelect,
  McpTablePlainText,
  McpTableRadio,
  McpTableRemove,
  McpTableToggle,
  McpTableTransportLabel,
} from "./table/McpTableCells";
import { useMcpExpandedRow } from "./table/useMcpExpandedRow";

const TRANSPORT_GRID = "40px 168px minmax(0, 1fr) 72px";
const COMPILED_GRID = "minmax(0, 1fr)";
const ARG_GRID = "minmax(0, 1fr) 72px 44px";
const TRANSPORTS: RunCommandTransport[] = ["stdio", "streamable-http", "sse"];

const TRANSPORT_OPTIONS = TRANSPORTS.map((transport) => ({
  value: transport,
  label: TRANSPORT_LABELS[transport],
}));

type McpRunCommandsSectionProps = {
  state: RunCommandsState;
  env: Record<string, string>;
  onChange: (state: RunCommandsState) => void;
};

function TransportBashTable({
  commands,
  activeId,
  env,
  expandedRowId,
  composerOpen,
  onSelect,
  onChange,
  onRemove,
  onAddClick,
  onPickTransport,
  onCancelComposer,
  tableRef,
}: {
  commands: RunCommandProfile[];
  activeId: string | null;
  env: Record<string, string>;
  expandedRowId: string | null;
  composerOpen: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, profile: RunCommandProfile) => void;
  onRemove: (id: string) => void;
  onAddClick: () => void;
  onPickTransport: (transport: RunCommandTransport) => void;
  onCancelComposer: () => void;
  tableRef: React.RefObject<HTMLDivElement | null>;
}) {
  const hasBody = commands.length > 0 || composerOpen;
  const composerIsLastRow = composerOpen && commands.length === 0;

  return (
    <div ref={tableRef} style={{ ...mcpBlackBlock, overflow: "visible" }}>
      <McpDataTable
        gridColumns={TRANSPORT_GRID}
        columns={[
          { key: "radio", header: "" },
          { key: "type", header: "Type", headerStyle: { paddingLeft: 16 } },
          { key: "bash", header: "bash" },
          {
            key: "add",
            header: <McpTableAddHeader onClick={onAddClick} disabled={composerOpen} />,
            headerStyle: { justifyContent: "flex-end" },
          },
        ]}
        empty={
          !hasBody ? (
            <McpTableEmptyRow message="No run profiles yet. Click Add to create stdio, Streamable HTTP, or SSE." />
          ) : undefined
        }
        bare
      >
        {composerOpen ? (
          <McpTableRow rowId="__transport-composer__">
            <McpTableCell isLastRow={composerIsLastRow} align="center">
              {null}
            </McpTableCell>
            <McpTableCell isLastRow={composerIsLastRow} style={{ paddingLeft: 16 }}>
              <McpTablePickerSelect
                value={null}
                options={TRANSPORT_OPTIONS}
                onSelect={(option) => onPickTransport(option.value)}
                placeholder="Select transport…"
                autoOpen
              />
            </McpTableCell>
            <McpTableCell isLastRow={composerIsLastRow}>
              <span style={{ color: colors.muted, fontSize: 12 }}>—</span>
            </McpTableCell>
            <McpTableCell isLastRow={composerIsLastRow} align="end">
              <McpTableRemove onClick={onCancelComposer} ariaLabel="Cancel new transport" />
            </McpTableCell>
          </McpTableRow>
        ) : null}

        {commands.map((profile, index) => {
          const selected = activeId === profile.id;
          const isRemote = profile.transport !== "stdio";
          const bashValue = isRemote ? (profile.url ?? "") : profile.command;
          const isExpanded = expandedRowId === profile.id;
          const isLastRow = index === commands.length - 1 && !composerOpen;

          return (
            <McpTableRow key={profile.id} rowId={profile.id}>
              <McpTableCell isLastRow={isLastRow} isRowExpanded={isExpanded} align="center">
                <McpTableRadio
                  checked={selected}
                  label={`Use ${TRANSPORT_LABELS[profile.transport]} command`}
                  onChange={() => onSelect(profile.id)}
                />
              </McpTableCell>
              <McpTableCell
                isLastRow={isLastRow}
                isRowExpanded={isExpanded}
                style={{ paddingLeft: 16 }}
              >
                <McpTableTransportLabel
                  label={TRANSPORT_LABELS[profile.transport]}
                  active={selected}
                />
              </McpTableCell>
              <McpTableCell isLastRow={isLastRow} isRowExpanded={isExpanded}>
                {isRemote ? (
                  <div data-mcp-row-interactive style={{ width: "100%" }}>
                    <EnvTemplateInput
                      value={bashValue}
                      onChange={(next) => onChange(profile.id, { ...profile, url: next })}
                      env={env}
                      monospace
                      active={selected}
                      placeholder="https://..."
                    />
                  </div>
                ) : (
                  <McpTableEditableText
                    value={bashValue}
                    onChange={(next) => onChange(profile.id, { ...profile, command: next })}
                    placeholder="npx -y @modelcontextprotocol/server-..."
                    isRowExpanded={isExpanded}
                    active={selected}
                    onActivate={() => onSelect(profile.id)}
                  />
                )}
              </McpTableCell>
              <McpTableCell isLastRow={isLastRow} isRowExpanded={isExpanded} align="end">
                <McpTableRemove
                  onClick={() => onRemove(profile.id)}
                  ariaLabel="Remove transport profile"
                />
              </McpTableCell>
            </McpTableRow>
          );
        })}
      </McpDataTable>
    </div>
  );
}

function ArgumentsTable({
  args,
  env,
  onChange,
}: {
  args: RunCommandArg[];
  env: Record<string, string>;
  onChange: (args: RunCommandArg[]) => void;
}) {
  return (
    <McpDataTable
      gridColumns={ARG_GRID}
      columns={[
        { key: "arg", header: "Argument" },
        { key: "toggle", header: "Toggle", headerStyle: { justifyContent: "center" } },
        {
          key: "add",
          header: <McpTableAddHeader onClick={() => onChange([...args, createEmptyRunCommandArg()])} />,
          headerStyle: { justifyContent: "flex-end" },
        },
      ]}
      empty={args.length === 0 ? <McpTableEmptyRow message="No arguments yet." /> : undefined}
    >
      {args.map((arg, index) => {
        const isLastRow = index === args.length - 1;
        const enabled = arg.enabled;
        return (
          <McpTableRow key={arg.id} rowId={arg.id}>
            <McpTableCell
              isLastRow={isLastRow}
              style={{ overflow: "visible", opacity: enabled ? 1 : 0.75 }}
            >
              <div data-mcp-row-interactive style={{ width: "100%" }}>
                <EnvTemplateInput
                  value={arg.name}
                  onChange={(name) =>
                    onChange(args.map((entry) => (entry.id === arg.id ? { ...entry, name } : entry)))
                  }
                  env={env}
                  monospace
                  dimmed={!enabled}
                  placeholder="--flag or ${api_key}"
                />
              </div>
            </McpTableCell>
            <McpTableCell isLastRow={isLastRow} align="center">
              <McpTableToggle
                checked={enabled}
                onChange={(next) =>
                  onChange(
                    args.map((entry) =>
                      entry.id === arg.id ? { ...entry, enabled: next } : entry,
                    ),
                  )
                }
                ariaLabel={`Toggle ${arg.name || "argument"}`}
              />
            </McpTableCell>
            <McpTableCell isLastRow={isLastRow} align="end">
              <McpTableRemove
                onClick={() => onChange(args.filter((entry) => entry.id !== arg.id))}
                ariaLabel="Remove argument"
              />
            </McpTableCell>
          </McpTableRow>
        );
      })}
    </McpDataTable>
  );
}

function CompiledCommandTable({ command }: { command: string }) {
  const display = command.trim();

  return (
    <YStack gap={8}>
      <SectionLabel>Compiled command</SectionLabel>
      <McpDataTable
        gridColumns={COMPILED_GRID}
        columns={[
          {
            key: "bash",
            header: (
              <>
                <McpTableHeaderLabel>bash</McpTableHeaderLabel>
                <McpTableHeaderCopy value={display} disabled={!display} />
              </>
            ),
            headerStyle: { justifyContent: "space-between" },
          },
        ]}
      >
        <McpTableRow rowId="compiled">
          <McpTableCell isLastRow>
            <McpTablePlainText
              value={display}
              placeholder="—"
              monospace
              isRowExpanded
            />
          </McpTableCell>
        </McpTableRow>
      </McpDataTable>
    </YStack>
  );
}

export function McpRunCommandsSection({
  state,
  env,
  onChange,
}: McpRunCommandsSectionProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  useMcpExpandedRow(expandedRowId, setExpandedRowId, tableRef);

  const addTransport = (transport: RunCommandTransport) => {
    const profile = createEmptyRunCommand(transport);
    onChange({
      ...state,
      activeId: profile.id,
      commands: [...state.commands, profile],
    });
    setComposerOpen(false);
  };

  const updateProfile = (id: string, profile: RunCommandProfile) => {
    onChange({
      ...state,
      commands: state.commands.map((entry) => (entry.id === id ? profile : entry)),
    });
  };

  const removeProfile = (id: string) => {
    const next = state.commands.filter((entry) => entry.id !== id);
    const nextActive = state.activeId === id ? (next[0]?.id ?? null) : state.activeId;
    if (expandedRowId === id) {
      setExpandedRowId(null);
    }
    onChange({ ...state, activeId: nextActive, commands: next });
  };

  const activeProfile =
    state.commands.find((entry) => entry.id === state.activeId) ??
    state.commands[0] ??
    null;

  const envRows = useMemo(() => parseStoredEnvRows(env), [env]);
  const sharedArgs = state.sharedArgs ?? [];

  const compiledCommand = useMemo(() => {
    if (!activeProfile) {
      return "";
    }
    return compileRunCommandShell(activeProfile, env, envRows, sharedArgs);
  }, [activeProfile, env, envRows, sharedArgs]);

  return (
    <YStack gap={8}>
      <McpSectionHeader title="Run commands" />

      <TransportBashTable
        commands={state.commands}
        activeId={state.activeId}
        env={env}
        expandedRowId={expandedRowId}
        onSelect={(id) => onChange({ ...state, activeId: id })}
        onChange={updateProfile}
        onRemove={removeProfile}
        composerOpen={composerOpen}
        onAddClick={() => setComposerOpen(true)}
        onPickTransport={addTransport}
        onCancelComposer={() => setComposerOpen(false)}
        tableRef={tableRef}
      />

      {state.commands.length > 0 ? (
        <ArgumentsTable
          args={sharedArgs}
          env={env}
          onChange={(nextArgs) => onChange({ ...state, sharedArgs: nextArgs })}
        />
      ) : null}

      <CompiledCommandTable command={compiledCommand} />
    </YStack>
  );
}

export function runCommandsFromValues(
  values: Record<string, string>,
  fallbackRunCommand: string,
): RunCommandsState {
  const raw = values[RUN_COMMANDS_CONFIG_KEY];
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as RunCommandsState;
      if (parsed?.commands?.length) {
        return normalizeRunCommandsState({
          activeId: parsed.activeId ?? parsed.commands[0]?.id ?? null,
          commands: parsed.commands,
          sharedArgs: Array.isArray(parsed.sharedArgs) ? parsed.sharedArgs : [],
        });
      }
    } catch {
      /* migrate below */
    }
  }
  if (!fallbackRunCommand.trim()) {
    return { activeId: null, commands: [], sharedArgs: [] };
  }
  const profile = createEmptyRunCommand("stdio");
  profile.command = fallbackRunCommand;
  return { activeId: profile.id, commands: [profile], sharedArgs: [] };
}

export function mergeRunCommandsIntoValues(
  values: Record<string, string>,
  state: RunCommandsState,
): Record<string, string> {
  return {
    ...values,
    [RUN_COMMANDS_CONFIG_KEY]: JSON.stringify(
      normalizeRunCommandsState(state),
    ),
  };
}
