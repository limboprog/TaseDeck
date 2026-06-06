import { useCallback, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import {
  probeMcpOperation,
  type McpProbeOperation,
  type McpProbeResult,
} from "../../services/mcp_installed/probeApi";
import { colors } from "../../theme";
import { SectionLabel } from "./McpEnvVariablesInline";
import { McpDataTable, McpTableRow } from "./table/McpDataTable";
import {
  McpTableCell,
  McpTableCopyAction,
  McpTableEllipsisText,
  McpTableFirstLine,
  McpTablePlainText,
  McpTableRunAction,
} from "./table/McpTableCells";
import { useMcpExpandedRow } from "./table/useMcpExpandedRow";

const TEST_GRID = "max-content max-content minmax(0, 1fr) max-content";
const TEST_COLUMN_GAP = 26;
const TEST_ACTION_PAD_LEFT = 18;

type TestRowDef = {
  id: string;
  operation: string;
  probeOp: McpProbeOperation;
};

const TEST_ROWS: TestRowDef[] = [
  { id: "initialize", operation: "Initialize", probeOp: "initialize" },
  { id: "list", operation: "List", probeOp: "tools_list" },
];

type RowState = {
  status: "idle" | "running" | "success" | "error";
  result: string;
};

function statusLabel(status: RowState["status"]): string {
  if (status === "success") {
    return "Success";
  }
  if (status === "error") {
    return "Error";
  }
  return "—";
}

function statusColor(status: RowState["status"]): string {
  if (status === "success") {
    return colors.success;
  }
  if (status === "error") {
    return colors.error;
  }
  return colors.muted;
}

type McpServerTestSectionProps = {
  serverId: number;
};

export function McpServerTestSection({ serverId }: McpServerTestSectionProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(TEST_ROWS.map((row) => [row.id, { status: "idle", result: "" }])),
  );
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  useMcpExpandedRow(expandedRowId, setExpandedRowId, tableRef);

  const runTest = useCallback(
    async (row: TestRowDef, event: MouseEvent) => {
      event.stopPropagation();
      flushSync(() => {
        setRows((current) => ({
          ...current,
          [row.id]: { status: "running", result: current[row.id]?.result ?? "" },
        }));
      });

      try {
        const response: McpProbeResult = await probeMcpOperation(serverId, row.probeOp);
        setRows((current) => ({
          ...current,
          [row.id]: {
            status: response.success ? "success" : "error",
            result: response.result,
          },
        }));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setRows((current) => ({
          ...current,
          [row.id]: { status: "error", result: message },
        }));
      }
    },
    [serverId],
  );

  const copyResult = useCallback(async (rowId: string, text: string, event: MouseEvent) => {
    event.stopPropagation();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRowId(rowId);
      window.setTimeout(() => setCopiedRowId(null), 1500);
    } catch {
      setCopiedRowId(null);
    }
  }, []);

  return (
    <div>
      <SectionLabel>Test</SectionLabel>
      <McpDataTable
        shellRef={tableRef}
        shellStyle={{ marginTop: 8 }}
        gridColumns={TEST_GRID}
        columnGap={TEST_COLUMN_GAP}
        columns={[
          { key: "op", header: "Operation" },
          { key: "status", header: "Status" },
          { key: "result", header: "Result" },
          {
            key: "action",
            header: "Test",
            headerStyle: {
              paddingLeft: 12 + TEST_ACTION_PAD_LEFT,
              justifyContent: "flex-end",
            },
          },
        ]}
      >
        {TEST_ROWS.map((row, index) => {
          const state = rows[row.id] ?? { status: "idle", result: "" };
          const isExpanded = expandedRowId === row.id;
          const isLastRow = index === TEST_ROWS.length - 1;

          return (
            <McpTableRow key={row.id} rowId={row.id}>
              <McpTableCell isLastRow={isLastRow} isRowExpanded={isExpanded}>
                <McpTablePlainText
                  value={row.operation}
                  fontSize={13}
                  fontWeight={500}
                  isRowExpanded={isExpanded}
                />
              </McpTableCell>
              <McpTableCell isLastRow={isLastRow} isRowExpanded={isExpanded}>
                <McpTableFirstLine>
                  <span
                    style={{
                      color: statusColor(state.status),
                      fontSize: 12,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {statusLabel(state.status)}
                  </span>
                </McpTableFirstLine>
              </McpTableCell>
              <McpTableCell
                isLastRow={isLastRow}
                isRowExpanded={isExpanded}
                style={{ paddingRight: 8 }}
              >
                {state.result ? (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "flex-start",
                      gap: 6,
                      minWidth: 0,
                      maxWidth: "100%",
                    }}
                  >
                    <McpTableEllipsisText
                      value={state.result}
                      isRowExpanded={isExpanded}
                      fontSize={11}
                      monospace
                    />
                    <McpTableCopyAction
                      copied={copiedRowId === row.id}
                      onClick={(event) => void copyResult(row.id, state.result, event)}
                    />
                  </div>
                ) : (
                  <span style={{ color: colors.muted, fontSize: 12 }}>—</span>
                )}
              </McpTableCell>
              <McpTableCell
                isLastRow={isLastRow}
                align="end"
                style={{ paddingLeft: 12 + TEST_ACTION_PAD_LEFT }}
              >
                <McpTableRunAction
                  loading={state.status === "running"}
                  onClick={(event) => void runTest(row, event)}
                />
              </McpTableCell>
            </McpTableRow>
          );
        })}
      </McpDataTable>
    </div>
  );
}
