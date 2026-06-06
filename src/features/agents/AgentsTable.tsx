import { useEffect, useMemo, useRef, useState } from "react";
import { PiBrain } from "../../icons";
import { pickConfigDirectory } from "../../services/agents/api";
import { AGENT_CATALOG, catalogEntryForLabel } from "../../services/agents/constants";
import { resolveAgentConfigDir } from "../../services/agents/resolveConfigDir";
import {
  createAgentRecord,
  deleteAgentRecord,
  updateAgentRecord,
  type AgentRecord,
} from "../../services/agents/recordsApi";
import type { AgentKind } from "../../services/agents/types";
import { colors } from "../../theme";
import { McpDataTable, McpTableRow } from "../mcp/table/McpDataTable";
import {
  McpTableAddHeader,
  McpTableCell,
  McpTableEmptyRow,
  McpTableFolderPath,
  McpTableIconText,
  McpTablePickerSearch,
  McpTableRemove,
} from "../mcp/table/McpTableCells";

const GRID_COLUMNS = "minmax(0, 1fr) minmax(0, 2fr) 72px";
const AGENT_ICON = <PiBrain size={16} color={colors.muted} style={{ flexShrink: 0 }} />;
const AGENT_OPTIONS = AGENT_CATALOG.map((entry) => ({ value: entry.kind, label: entry.label }));

type AgentComposerDraft = {
  name: string;
  kind: AgentKind;
  path: string;
  resolvingPath: boolean;
  nameLocked: boolean;
};

type AgentsTableProps = {
  agents: AgentRecord[];
  onUpdated: () => void;
  onError: (message: string | null) => void;
};

export function AgentsTable({ agents, onUpdated, onError }: AgentsTableProps) {
  const [composer, setComposer] = useState<AgentComposerDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const resolveGenerationRef = useRef(0);
  const composerRef = useRef<AgentComposerDraft | null>(null);

  composerRef.current = composer;

  const saveComposer = async (draft: AgentComposerDraft) => {
    const catalog = catalogEntryForLabel(draft.name.trim());
    if (!catalog) {
      onError("Choose a supported agent from the list.");
      return;
    }

    const path = draft.path.trim();
    if (!path) {
      onError(
        `Config folder for ${catalog.label} is required. Pick it with the folder button.`,
      );
      return;
    }

    setCreating(true);
    onError(null);
    try {
      await createAgentRecord({
        name: catalog.label,
        kind: catalog.kind,
        configDirPath: path,
      });
      setComposer(null);
      onUpdated();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  };

  const resolvePathForKind = (kind: AgentKind, label: string, autoSave: boolean) => {
    const generation = resolveGenerationRef.current + 1;
    resolveGenerationRef.current = generation;

    setComposer((current) =>
      current ? { ...current, kind, resolvingPath: true, path: "" } : current,
    );
    onError(null);

    void resolveAgentConfigDir(kind)
      .then((dir) => {
        if (resolveGenerationRef.current !== generation) {
          return;
        }

        const path = dir?.trim() ?? "";
        const nextDraft: AgentComposerDraft = {
          ...(composerRef.current ?? {
            name: label,
            kind,
            path: "",
            resolvingPath: false,
            nameLocked: true,
          }),
          kind,
          name: label,
          path,
          resolvingPath: false,
          nameLocked: true,
        };

        setComposer(nextDraft);

        if (!path) {
          onError(
            `Config folder for ${label} was not found automatically. Pick it with the folder button.`,
          );
          return;
        }

        if (autoSave) {
          void saveComposer(nextDraft);
        }
      })
      .catch((cause) => {
        if (resolveGenerationRef.current !== generation) {
          return;
        }
        setComposer((current) =>
          current ? { ...current, path: "", resolvingPath: false } : current,
        );
        onError(cause instanceof Error ? cause.message : String(cause));
      });
  };

  const handleAdd = () => {
    if (composer) {
      return;
    }
    onError(null);
    setComposer({
      name: "",
      kind: "cursor",
      path: "",
      resolvingPath: false,
      nameLocked: false,
    });
  };

  const handleComposerCancel = () => {
    resolveGenerationRef.current += 1;
    setComposer(null);
    onError(null);
  };

  const handleComposerPick = (kind: AgentKind, label: string) => {
    setComposer({
      name: label,
      kind,
      path: "",
      resolvingPath: true,
      nameLocked: true,
    });
    resolvePathForKind(kind, label, true);
  };

  const handleComposerCommitName = () => {
    if (!composer) {
      return;
    }
    const trimmed = composer.name.trim();
    if (!trimmed) {
      return;
    }
    const catalog = catalogEntryForLabel(trimmed);
    if (catalog) {
      handleComposerPick(catalog.kind, catalog.label);
    }
  };

  const handleComposerSave = async () => {
    if (!composer || creating) {
      return;
    }
    await saveComposer(composer);
  };

  const handleRemove = async (id: number) => {
    onError(null);
    try {
      await deleteAgentRecord(id);
      onUpdated();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const hasBody = agents.length > 0 || composer !== null;
  const composerIsLastRow = Boolean(composer) && agents.length === 0;

  return (
    <McpDataTable
      shellStyle={{ overflow: "visible" }}
      gridColumns={GRID_COLUMNS}
      columns={[
        { key: "name", header: "Name" },
        { key: "path", header: "Path" },
        {
          key: "actions",
          header: (
            <McpTableAddHeader
              onClick={handleAdd}
              disabled={composer !== null || creating}
            />
          ),
          headerStyle: { justifyContent: "flex-end" },
        },
      ]}
      empty={
        !hasBody ? (
          <McpTableEmptyRow message="No agents yet. Click Add in the header row." />
        ) : undefined
      }
    >
      {composer ? (
        <McpTableRow rowId="__composer__">
          <McpTableCell isLastRow={composerIsLastRow}>
            {composer.nameLocked ? (
              <McpTableIconText icon={AGENT_ICON} value={composer.name} />
            ) : (
              <McpTablePickerSearch
                value={composer.name}
                options={AGENT_OPTIONS}
                icon={AGENT_ICON}
                onValueChange={(name) =>
                  setComposer((current) => (current ? { ...current, name } : current))
                }
                onSelect={(option) =>
                  handleComposerPick(option.value as AgentKind, option.label)
                }
                onCommit={handleComposerCommitName}
                filterOption={(option, query) =>
                  option.label.toLowerCase().includes(query) ||
                  option.value.toLowerCase().includes(query)
                }
                placeholder="Cursor, Claude Code…"
                autoFocus
              />
            )}
          </McpTableCell>
          <McpTableCell isLastRow={composerIsLastRow}>
            <McpTableFolderPath
              value={composer.path}
              resolving={composer.resolvingPath || creating}
              commitOnBlur={false}
              placeholder="Config folder path"
              onPickFolder={pickConfigDirectory}
              onChange={(path) => {
                onError(null);
                setComposer((current) => (current ? { ...current, path } : current));
              }}
              onCommit={() => void handleComposerSave()}
            />
          </McpTableCell>
          <McpTableCell isLastRow={composerIsLastRow} align="end">
            <McpTableRemove onClick={handleComposerCancel} ariaLabel="Cancel new agent" />
          </McpTableCell>
        </McpTableRow>
      ) : null}

      {agents.map((agent, index) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          isLast={index === agents.length - 1}
          onUpdated={onUpdated}
          onError={onError}
          onRemove={() => void handleRemove(agent.id)}
        />
      ))}
    </McpDataTable>
  );
}

function AgentRow({
  agent,
  isLast,
  onUpdated,
  onError,
  onRemove,
}: {
  agent: AgentRecord;
  isLast: boolean;
  onUpdated: () => void;
  onError: (message: string | null) => void;
  onRemove: () => void;
}) {
  const [draftPath, setDraftPath] = useState(agent.configDirPath);

  useEffect(() => {
    setDraftPath(agent.configDirPath);
  }, [agent.configDirPath, agent.id]);

  const isDirty = useMemo(
    () => draftPath.trim() !== agent.configDirPath.trim(),
    [agent.configDirPath, draftPath],
  );

  const persist = async () => {
    const trimmedPath = draftPath.trim();
    if (!trimmedPath || !isDirty) {
      return;
    }
    onError(null);
    try {
      await updateAgentRecord({ ...agent, configDirPath: trimmedPath });
      onUpdated();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <McpTableRow rowId={String(agent.id)}>
      <McpTableCell isLastRow={isLast}>
        <McpTableIconText icon={AGENT_ICON} value={agent.name} />
      </McpTableCell>
      <McpTableCell isLastRow={isLast}>
        <McpTableFolderPath
          value={draftPath}
          placeholder="Config folder path"
          onPickFolder={pickConfigDirectory}
          onChange={setDraftPath}
          onCommit={() => void persist()}
        />
      </McpTableCell>
      <McpTableCell isLastRow={isLast} align="end">
        <McpTableRemove onClick={onRemove} ariaLabel="Remove agent" />
      </McpTableCell>
    </McpTableRow>
  );
}
