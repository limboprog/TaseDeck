import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Text, YStack } from "tamagui";
import { colors } from "../../theme";
import {
  createNewEnvRow,
  envInputsFromRows,
  envValuesFromRows,
  parseStoredEnvRows,
} from "../../services/mcp_installed/storedEnv";
import type { EnvVariableRow } from "../../services/mcp_installed/envEditor";
import type { ConfigInput } from "../../services/mcp_registry/parser";
import { McpSectionHeader } from "./McpSectionHeader";
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

const GRID_COLUMNS = "minmax(0, 1.05fr) minmax(0, 0.95fr) minmax(0, 0.95fr) 48px";

type EnvComposerDraft = {
  label: string;
  identificator: string;
  token: string;
};

function isComposerComplete(draft: EnvComposerDraft | null): draft is EnvComposerDraft {
  if (!draft) {
    return false;
  }
  return Boolean(
    draft.label.trim() && draft.identificator.trim() && draft.token.trim(),
  );
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
  rows,
  composer,
  onComposerChange,
  onComposerSave,
  onRemoveRow,
  onAdd,
  addDisabled,
}: {
  rows: EnvVariableRow[];
  composer: EnvComposerDraft | null;
  onComposerChange: (patch: Partial<EnvComposerDraft>) => void;
  onComposerSave: () => void;
  onRemoveRow: (rowId: string) => void;
  onAdd: () => void;
  addDisabled: boolean;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  useMcpExpandedRow(expandedRowId, setExpandedRowId, tableRef);

  const canAddRow = isComposerComplete(composer);
  const hasBody = rows.length > 0 || composer !== null;
  const composerIsLastRow = Boolean(composer) && rows.length === 0;

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && canAddRow) {
      event.preventDefault();
      onComposerSave();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onComposerChange({ label: "", identificator: "", token: "" });
    }
  };

  return (
    <McpDataTable
      shellRef={tableRef}
      gridColumns={GRID_COLUMNS}
      columns={[
        { key: "name", header: "Name" },
        { key: "id", header: "Identificator", headerStyle: { paddingLeft: 6 } },
        { key: "token", header: "Token", headerStyle: { paddingLeft: 6 } },
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
      {composer ? (
        <McpTableRow rowId="__composer__">
          <McpTableCell isLastRow={composerIsLastRow} isRowExpanded={expandedRowId === "__composer__"}>
            <McpTableInput
              value={composer.label}
              onChange={(label) => onComposerChange({ label })}
              onKeyDown={handleComposerKeyDown}
              placeholder="Display name"
            />
          </McpTableCell>
          <McpTableCell
            isLastRow={composerIsLastRow}
            isRowExpanded={expandedRowId === "__composer__"}
            style={{ paddingLeft: 6 }}
          >
            <McpTableInput
              value={composer.identificator}
              onChange={(identificator) => onComposerChange({ identificator })}
              onKeyDown={handleComposerKeyDown}
              placeholder="api_key"
              monospace
            />
          </McpTableCell>
          <McpTableCell
            isLastRow={composerIsLastRow}
            isRowExpanded={expandedRowId === "__composer__"}
            style={{ paddingLeft: 6 }}
          >
            <McpTableInput
              value={composer.token}
              onChange={(token) => onComposerChange({ token })}
              onKeyDown={handleComposerKeyDown}
              placeholder="secret value"
            />
          </McpTableCell>
          <McpTableCell isLastRow={composerIsLastRow} align="end">
            <McpTableSave onClick={onComposerSave} disabled={!canAddRow} />
          </McpTableCell>
        </McpTableRow>
      ) : null}

      {rows.map((row, index) => {
        const isLastRow = index === rows.length - 1;
        const isExpanded = expandedRowId === row.id;
        return (
          <McpTableRow key={row.id} rowId={row.id}>
            <McpTableCell isLastRow={isLastRow} isRowExpanded={isExpanded}>
              <McpTablePlainText value={row.label?.trim() || ""} isRowExpanded={isExpanded} />
            </McpTableCell>
            <McpTableCell isLastRow={isLastRow} isRowExpanded={isExpanded} style={{ paddingLeft: 6 }}>
              <McpTablePlainText
                value={row.name}
                monospace
                isRowExpanded={isExpanded}
              />
            </McpTableCell>
            <McpTableCell isLastRow={isLastRow} isRowExpanded={isExpanded} style={{ paddingLeft: 6 }}>
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

const emptyComposer = (): EnvComposerDraft => ({
  label: "",
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
  const [rows, setRows] = useState<EnvVariableRow[]>(() => parseStoredEnvRows(values));
  const [composer, setComposer] = useState<EnvComposerDraft | null>(null);
  const onChangeRef = useRef(onChange);
  const onPersistRef = useRef(onPersist);
  const baseInputsRef = useRef(baseInputs);
  const valuesRef = useRef(values);

  onChangeRef.current = onChange;
  onPersistRef.current = onPersist;
  baseInputsRef.current = baseInputs;
  valuesRef.current = values;

  useEffect(() => {
    const parsed = parseStoredEnvRows(values);
    setRows(parsed);
    setComposer(null);
  }, [resetKey, values]);

  const commitToParent = async (nextRows: EnvVariableRow[]) => {
    const mergedValues = envValuesFromRows(valuesRef.current, nextRows);
    const mergedInputs = envInputsFromRows(baseInputsRef.current, nextRows);
    onChangeRef.current(mergedValues, mergedInputs);
    await onPersistRef.current?.(mergedValues, mergedInputs);
  };

  const handleComposerSave = () => {
    if (!isComposerComplete(composer)) {
      return;
    }
    const label = composer.label.trim();
    const identificator = composer.identificator.trim();
    const token = composer.token.trim();
    const newRow: EnvVariableRow = {
      ...createNewEnvRow(),
      name: identificator,
      value: token,
      label,
    };
    const next = [...rows, newRow];
    setRows(next);
    setComposer(null);
    void commitToParent(next);
  };

  const removeRow = (rowId: string) => {
    const next = rows.filter((entry) => entry.id !== rowId);
    setRows(next);
    void commitToParent(next);
  };

  const handleAdd = () => {
    if (composer) {
      return;
    }
    setComposer(emptyComposer());
  };

  return (
    <YStack gap={8}>
      <McpSectionHeader title="Environment variables" />
      <EnvVariablesTable
        rows={rows}
        composer={composer}
        onComposerChange={(patch) => setComposer((current) => (current ? { ...current, ...patch } : current))}
        onComposerSave={handleComposerSave}
        onRemoveRow={removeRow}
        onAdd={handleAdd}
        addDisabled={composer !== null}
      />
    </YStack>
  );
}
