import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Text, YStack } from "tamagui";
import { colors } from "../../theme";
import {
  createNewEnvRow,
  envInputsFromRows,
  envValuesFromRows,
  parseStoredEnvRows,
} from "../../services/mcp_installed/storedEnv";
import {
  canonicalEnvId,
  normalizeEnvVariableName,
} from "../../services/mcp_installed/variableNames";
import type { EnvVariableRow } from "../../services/mcp_installed/envEditor";
import type { ConfigInput } from "../../services/mcp_registry/parser";
import { McpSectionHeader } from "./McpSectionHeader";
import { mcpTableLeadingColumnStyle } from "./mcpTableStyles";
import { McpDataTable, McpTableRow } from "./table/McpDataTable";
import {
  McpTableAddHeader,
  McpTableCell,
  McpTableEmptyRow,
  McpTableInput,
  McpTablePlainText,
  McpTableRemove,
  McpTableSave,
} from "./table/McpTableCells";
import { useMcpExpandedRow } from "./table/useMcpExpandedRow";

const GRID_COLUMNS = "minmax(0, 1fr) minmax(0, 1fr) 44px";

type EnvComposerDraft = {
  id: string;
  identificator: string;
  token: string;
};

function createDraftId() {
  return `env-draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isDraftComplete(draft: EnvComposerDraft): boolean {
  return Boolean(draft.identificator.trim() && draft.token.trim());
}

function deriveEnvUiState(
  values: Record<string, string>,
  baseInputs: ConfigInput[],
): { committed: EnvVariableRow[]; pending: EnvComposerDraft[] } {
  const committed: EnvVariableRow[] = [];
  const pending: EnvComposerDraft[] = [];
  const seenNames = new Set<string>();

  for (const row of parseStoredEnvRows(values)) {
    const name = normalizeEnvVariableName(row.name);
    if (!name || seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    if (row.value.trim()) {
      committed.push({ ...row, isEditing: false });
    } else {
      pending.push({ id: row.id, identificator: name, token: "" });
    }
  }

  for (const input of baseInputs) {
    if (input.source !== "environment") {
      continue;
    }
    const name = normalizeEnvVariableName(input.name);
    if (!name || seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    const envId = canonicalEnvId(name);
    const token = values[envId]?.trim() || values[name]?.trim() || "";
    if (token) {
      committed.push({
        id: envId,
        name,
        value: token,
        isEditing: false,
      });
    } else {
      pending.push({
        id: envId,
        identificator: name,
        token: "",
      });
    }
  }

  return { committed, pending };
}

export function maskTokenValue(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return "—";
  }
  if (trimmed.length <= 6) {
    return `${trimmed.slice(0, 3)}...`;
  }
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
}

function EnvVariablesTable({
  committedRows,
  pendingDrafts,
  onPendingChange,
  onPendingSave,
  onRemoveRow,
  onAdd,
  addDisabled,
}: {
  committedRows: EnvVariableRow[];
  pendingDrafts: EnvComposerDraft[];
  onPendingChange: (draftId: string, patch: Partial<EnvComposerDraft>) => void;
  onPendingSave: (draftId: string) => void;
  onRemoveRow: (rowId: string) => void;
  onAdd: () => void;
  addDisabled: boolean;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  useMcpExpandedRow(expandedRowId, setExpandedRowId, tableRef);

  const hasBody = committedRows.length > 0 || pendingDrafts.length > 0;

  const handlePendingKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    draft: EnvComposerDraft,
  ) => {
    if (event.key === "Enter" && isDraftComplete(draft)) {
      event.preventDefault();
      onPendingSave(draft.id);
    }
    if (event.key === "Escape" && !draft.identificator.trim()) {
      event.preventDefault();
      onPendingChange(draft.id, { identificator: "", token: "" });
    }
  };

  return (
    <McpDataTable
      shellRef={tableRef}
      gridColumns={GRID_COLUMNS}
      columns={[
        {
          key: "id",
          header: "Identificator",
          headerStyle: mcpTableLeadingColumnStyle,
        },
        { key: "token", header: "Token" },
        {
          key: "actions",
          header: <McpTableAddHeader onClick={onAdd} disabled={addDisabled} />,
          headerStyle: { justifyContent: "flex-end" },
        },
      ]}
      empty={
        !hasBody ? (
          <McpTableEmptyRow message="No variables yet. Click Add, fill the row, then Save." />
        ) : undefined
      }
    >
      {pendingDrafts.map((draft, index) => {
        const isLastRow =
          index === pendingDrafts.length - 1 && committedRows.length === 0;
        const isExpanded = expandedRowId === draft.id;
        return (
          <McpTableRow key={draft.id} rowId={draft.id}>
            <McpTableCell
              isLastRow={isLastRow}
              isRowExpanded={isExpanded}
              style={mcpTableLeadingColumnStyle}
              interactive
            >
              <div data-mcp-row-interactive style={{ width: "100%" }}>
                <McpTableInput
                  value={draft.identificator}
                  onChange={(identificator) =>
                    onPendingChange(draft.id, { identificator })
                  }
                  onKeyDown={(event) => handlePendingKeyDown(event, draft)}
                  placeholder="api_key"
                  monospace
                />
              </div>
            </McpTableCell>
            <McpTableCell
              isLastRow={isLastRow}
              isRowExpanded={isExpanded}
              interactive
            >
              <div data-mcp-row-interactive style={{ width: "100%" }}>
                <McpTableInput
                  value={draft.token}
                  onChange={(token) => onPendingChange(draft.id, { token })}
                  onKeyDown={(event) => handlePendingKeyDown(event, draft)}
                  placeholder="Enter value"
                />
              </div>
            </McpTableCell>
            <McpTableCell isLastRow={isLastRow} align="end">
              <McpTableSave
                onClick={() => onPendingSave(draft.id)}
                disabled={!isDraftComplete(draft)}
              />
            </McpTableCell>
          </McpTableRow>
        );
      })}

      {committedRows.map((row, index) => {
        const isLastRow = index === committedRows.length - 1;
        const isExpanded = expandedRowId === row.id;
        return (
          <McpTableRow key={row.id} rowId={row.id}>
            <McpTableCell
              isLastRow={isLastRow}
              isRowExpanded={isExpanded}
              style={mcpTableLeadingColumnStyle}
            >
              <McpTablePlainText
                value={row.name}
                monospace
                isRowExpanded={isExpanded}
              />
            </McpTableCell>
            <McpTableCell
              isLastRow={isLastRow}
              isRowExpanded={isExpanded}
            >
              <McpTablePlainText
                value={maskTokenValue(row.value)}
                monospace
                isRowExpanded={isExpanded}
              />
            </McpTableCell>
            <McpTableCell isLastRow={isLastRow} align="end">
              <McpTableRemove
                onClick={() => onRemoveRow(row.id)}
                ariaLabel="Remove variable"
              />
            </McpTableCell>
          </McpTableRow>
        );
      })}
    </McpDataTable>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text color={colors.muted} fontSize={11} fontWeight="500" select="none">
      {children}
    </Text>
  );
}

type McpEnvVariablesInlineProps = {
  resetKey: string | number;
  baseInputs: ConfigInput[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>, inputs: ConfigInput[]) => void;
  onPersist?: (values: Record<string, string>, inputs: ConfigInput[]) => Promise<void>;
};

const emptyDraft = (): EnvComposerDraft => ({
  id: createDraftId(),
  identificator: "",
  token: "",
});

export function McpEnvVariablesInline({
  resetKey,
  baseInputs,
  values,
  onChange,
  onPersist,
}: McpEnvVariablesInlineProps) {
  const initial = deriveEnvUiState(values, baseInputs);
  const [committedRows, setCommittedRows] = useState<EnvVariableRow[]>(
    () => initial.committed,
  );
  const [pendingDrafts, setPendingDrafts] = useState<EnvComposerDraft[]>(
    () => initial.pending,
  );
  const onChangeRef = useRef(onChange);
  const onPersistRef = useRef(onPersist);
  const baseInputsRef = useRef(baseInputs);
  const valuesRef = useRef(values);
  const skipValuesSyncRef = useRef(false);

  onChangeRef.current = onChange;
  onPersistRef.current = onPersist;
  baseInputsRef.current = baseInputs;
  valuesRef.current = values;

  const applyDerivedState = (next: ReturnType<typeof deriveEnvUiState>) => {
    setCommittedRows(next.committed);
    setPendingDrafts(next.pending);
  };

  useEffect(() => {
    applyDerivedState(deriveEnvUiState(values, baseInputs));
  }, [resetKey]);

  useEffect(() => {
    if (skipValuesSyncRef.current) {
      skipValuesSyncRef.current = false;
      return;
    }
    applyDerivedState(deriveEnvUiState(values, baseInputs));
  }, [values, baseInputs]);

  const commitToParent = async (nextCommitted: EnvVariableRow[]) => {
    const mergedValues = envValuesFromRows(valuesRef.current, nextCommitted);
    const mergedInputs = envInputsFromRows(baseInputsRef.current, nextCommitted);
    skipValuesSyncRef.current = true;
    onChangeRef.current(mergedValues, mergedInputs);
    await onPersistRef.current?.(mergedValues, mergedInputs);
  };

  const handlePendingChange = (
    draftId: string,
    patch: Partial<EnvComposerDraft>,
  ) => {
    setPendingDrafts((current) =>
      current.map((draft) =>
        draft.id === draftId ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const handlePendingSave = (draftId: string) => {
    const draft = pendingDrafts.find((entry) => entry.id === draftId);
    if (!draft || !isDraftComplete(draft)) {
      return;
    }
    const identificator = draft.identificator.trim();
    const token = draft.token.trim();
    const newRow: EnvVariableRow = {
      ...createNewEnvRow(),
      id: canonicalEnvId(identificator),
      name: normalizeEnvVariableName(identificator),
      value: token,
    };
    const nextCommitted = [...committedRows, newRow];
    const nextPending = pendingDrafts.filter((entry) => entry.id !== draftId);
    setCommittedRows(nextCommitted);
    setPendingDrafts(nextPending);
    void commitToParent(nextCommitted);
  };

  const removeRow = (rowId: string) => {
    const next = committedRows.filter((entry) => entry.id !== rowId);
    setCommittedRows(next);
    void commitToParent(next);
  };

  const handleAdd = () => {
    if (pendingDrafts.some((draft) => !draft.identificator.trim())) {
      return;
    }
    setPendingDrafts((current) => [...current, emptyDraft()]);
  };

  return (
    <YStack gap={8}>
      <McpSectionHeader title="Environment variables" />
      <EnvVariablesTable
        committedRows={committedRows}
        pendingDrafts={pendingDrafts}
        onPendingChange={handlePendingChange}
        onPendingSave={handlePendingSave}
        onRemoveRow={removeRow}
        onAdd={handleAdd}
        addDisabled={pendingDrafts.some((draft) => !draft.identificator.trim())}
      />
    </YStack>
  );
}
