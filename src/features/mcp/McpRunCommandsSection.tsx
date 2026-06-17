import { useEffect, useMemo, useRef, useState } from "react";
import { YStack } from "tamagui";
import { useMcpTransportCatalog } from "../../services/catalog";
import { resolveRunCommandsState } from "../../services/mcp_installed/configState";
import {
  RUN_COMMANDS_CONFIG_KEY,
  TRANSPORT_LABELS,
  compileRemoteRequestPreview,
  compileRunCommandTemplate,
  createEmptyRunCommand,
  createEmptyRunCommandArg,
  isRemoteRunTransport,
  normalizeRunCommandsState,
  type RunCommandArg,
  type RunCommandProfile,
  type RunCommandTransport,
  type RunCommandsState,
} from "../../services/mcp_installed/runCommands";
import {
  createEmptyHeaderRow,
  type HeaderVariableRow,
} from "../../services/mcp_installed/storedHeaders";
import { colors } from "../../theme";
import { EnvTemplateInput } from "./EnvTemplateInput";
import { SectionLabel } from "./McpEnvVariablesInline";
import { McpSectionHeader } from "./McpSectionHeader";
import { mcpBlackBlock, mcpTableLeadingColumnStyle } from "./mcpTableStyles";
import { McpDataTable, McpTableRow } from "./table/McpDataTable";
import {
  McpTableAddHeader,
  McpTableCell,
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
const COMPILED_ROW_ID = "compiled";
const ARG_GRID = "minmax(0, 1fr) 72px 44px";
const HEADER_GRID = "minmax(0, 1fr) minmax(0, 1fr) 44px";

function transportLabel(
  transport: string,
  options: Array<{ value: string; label: string }>,
): string {
  return (
    options.find((entry) => entry.value === transport)?.label ??
    TRANSPORT_LABELS[transport as RunCommandTransport] ??
    transport
  );
}

type McpRunCommandsSectionProps = {
  state: RunCommandsState;
  env: Record<string, string>;
  headers: HeaderVariableRow[];
  onChange: (state: RunCommandsState) => void;
  onHeadersChange: (headers: HeaderVariableRow[]) => void;
};

function TransportBashTable({
  commands,
  activeId,
  env,
  expandedRowId,
  composerOpen,
  transportOptions,
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
  transportOptions: Array<{ value: RunCommandTransport; label: string }>;
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
          { key: "bash", header: "bash/url" },
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
                options={transportOptions}
                onSelect={(option) => onPickTransport(option.value as RunCommandTransport)}
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
                  label={`Use ${transportLabel(profile.transport, transportOptions)} command`}
                  onChange={() => onSelect(profile.id)}
                />
              </McpTableCell>
              <McpTableCell
                isLastRow={isLastRow}
                isRowExpanded={isExpanded}
                style={{ paddingLeft: 16 }}
              >
                <McpTableTransportLabel
                  label={transportLabel(profile.transport, transportOptions)}
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
                  <div data-mcp-row-interactive style={{ width: "100%" }}>
                    <EnvTemplateInput
                      value={bashValue}
                      onChange={(next) => onChange(profile.id, { ...profile, command: next })}
                      env={env}
                      monospace
                      active={selected}
                      placeholder="npx -y @modelcontextprotocol/server-... or node ${script}"
                    />
                  </div>
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

function HeadersTable({
  headers,
  env,
  onChange,
}: {
  headers: HeaderVariableRow[];
  env: Record<string, string>;
  onChange: (headers: HeaderVariableRow[]) => void;
}) {
  const [rows, setRows] = useState(headers);
  const skipSyncRef = useRef(false);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    setRows(headers);
  }, [headers]);

  const updateRows = (next: HeaderVariableRow[]) => {
    setRows(next);
    skipSyncRef.current = true;
    onChange(next);
  };

  return (
    <McpDataTable
      gridColumns={HEADER_GRID}
      columns={[
        { key: "key", header: "Key", headerStyle: mcpTableLeadingColumnStyle },
        { key: "value", header: "Value" },
        {
          key: "add",
          header: (
            <McpTableAddHeader
              onClick={() => updateRows([...rows, createEmptyHeaderRow()])}
            />
          ),
          headerStyle: { justifyContent: "flex-end" },
        },
      ]}
      empty={
        rows.length === 0 ? (
          <McpTableEmptyRow message="No headers yet. Example: Authorization → Bearer ${api_key}" />
        ) : undefined
      }
    >
      {rows.map((header, index) => {
        const isLastRow = index === rows.length - 1;
        return (
          <McpTableRow key={header.id} rowId={header.id}>
            <McpTableCell
              isLastRow={isLastRow}
              style={{ ...mcpTableLeadingColumnStyle, overflow: "visible" }}
            >
              <div data-mcp-row-interactive style={{ width: "100%" }}>
                <EnvTemplateInput
                  value={header.name}
                  onChange={(name) =>
                    updateRows(
                      rows.map((entry) =>
                        entry.id === header.id ? { ...entry, name } : entry,
                      ),
                    )
                  }
                  env={env}
                  monospace
                  placeholder="Header name"
                />
              </div>
            </McpTableCell>
            <McpTableCell isLastRow={isLastRow} style={{ overflow: "visible" }}>
              <div data-mcp-row-interactive style={{ width: "100%" }}>
                <EnvTemplateInput
                  value={header.value}
                  onChange={(value) =>
                    updateRows(
                      rows.map((entry) =>
                        entry.id === header.id ? { ...entry, value } : entry,
                      ),
                    )
                  }
                  env={env}
                  monospace
                  placeholder="Enter value"
                />
              </div>
            </McpTableCell>
            <McpTableCell isLastRow={isLastRow} align="end">
              <McpTableRemove
                onClick={() => updateRows(rows.filter((entry) => entry.id !== header.id))}
                ariaLabel="Remove header"
              />
            </McpTableCell>
          </McpTableRow>
        );
      })}
    </McpDataTable>
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

function CompiledCommandTable({
  command,
  isRemote,
}: {
  command: string;
  isRemote: boolean;
}) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  useMcpExpandedRow(expandedRowId, setExpandedRowId, tableRef);

  const display = command.trim();
  const sectionTitle = isRemote ? "Request" : "Compiled command";
  const columnLabel = isRemote ? "Request" : "bash";
  const isExpanded = expandedRowId === COMPILED_ROW_ID;

  return (
    <YStack gap={8}>
      <SectionLabel>{sectionTitle}</SectionLabel>
      <McpDataTable
        shellRef={tableRef}
        gridColumns={COMPILED_GRID}
        columns={[
          {
            key: "bash",
            header: (
              <>
                <McpTableHeaderLabel>{columnLabel}</McpTableHeaderLabel>
                <McpTableHeaderCopy value={display} disabled={!display} />
              </>
            ),
            headerStyle: { justifyContent: "space-between" },
          },
        ]}
      >
        <McpTableRow rowId={COMPILED_ROW_ID}>
          <McpTableCell isLastRow isRowExpanded={isExpanded}>
            <McpTablePlainText
              value={display}
              placeholder="—"
              monospace
              isRowExpanded={isExpanded}
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
  headers,
  onChange,
  onHeadersChange,
}: McpRunCommandsSectionProps) {
  const transportCatalog = useMcpTransportCatalog();
  const transportOptions = useMemo(
    () =>
      transportCatalog.map((entry) => ({
        value: entry.id as RunCommandTransport,
        label: entry.label,
      })),
    [transportCatalog],
  );
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

  const sharedArgs = state.sharedArgs ?? [];
  const isRemote =
    activeProfile != null && isRemoteRunTransport(activeProfile.transport);

  const compiledCommand = useMemo(() => {
    if (!activeProfile) {
      return "";
    }
    if (activeProfile.transport !== "stdio") {
      return compileRemoteRequestPreview(activeProfile, { headers, env });
    }
    return compileRunCommandTemplate(activeProfile, sharedArgs);
  }, [activeProfile, sharedArgs, headers, env]);

  return (
    <YStack gap={8}>
      <McpSectionHeader title="Run commands" />

      <TransportBashTable
        commands={state.commands}
        activeId={state.activeId}
        env={env}
        expandedRowId={expandedRowId}
        transportOptions={transportOptions}
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
        isRemote ? (
          <HeadersTable
            headers={headers}
            env={env}
            onChange={onHeadersChange}
          />
        ) : (
          <ArgumentsTable
            args={sharedArgs}
            env={env}
            onChange={(nextArgs) => onChange({ ...state, sharedArgs: nextArgs })}
          />
        )
      ) : null}

      <CompiledCommandTable
        command={compiledCommand}
        isRemote={activeProfile != null && activeProfile.transport !== "stdio"}
      />
    </YStack>
  );
}

export function runCommandsFromValues(
  values: Record<string, string>,
  fallbackRunCommand: string,
  jsonConfig = "",
): RunCommandsState {
  return resolveRunCommandsState({
    values,
    runCommand: fallbackRunCommand,
    jsonConfig,
  });
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
