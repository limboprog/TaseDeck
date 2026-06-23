import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type MouseEvent } from "react";
import { parseAuthRequiredError } from "../../services/mcp_installed/oauthApi";
import type { McpAuthChallenge } from "../../services/mcp_installed/oauthApi";
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
const TEST_COLUMN_PAD = 26;
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

const INITIAL_ROWS = Object.fromEntries(
  TEST_ROWS.map((row) => [row.id, { status: "idle" as const, result: "" }]),
);

type McpServerTestSectionProps = {
  serverId: number;
  disabled?: boolean;
  resetKey?: string;
  onAuthRequired?: (challenge: McpAuthChallenge) => void;
};

export type McpServerTestSectionHandle = {
  runAll: () => Promise<void>;
};

export const McpServerTestSection = forwardRef<McpServerTestSectionHandle, McpServerTestSectionProps>(
  function McpServerTestSection(
    {
  serverId,
  disabled = false,
  resetKey = "",
  onAuthRequired,
},
  ref,
) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Record<string, RowState>>(() => ({ ...INITIAL_ROWS }));
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  useMcpExpandedRow(expandedRowId, setExpandedRowId, tableRef);

  useEffect(() => {
    setRows({ ...INITIAL_ROWS });
    setExpandedRowId(null);
    setCopiedRowId(null);
  }, [resetKey, serverId]);

  const runTestForRow = useCallback(
    async (row: TestRowDef) => {
      if (disabled) {
        return;
      }
      flushSync(() => {
        setRows((current) => ({
          ...current,
          [row.id]: { status: "running", result: current[row.id]?.result ?? "" },
        }));
      });

      try {
        const response: McpProbeResult = await probeMcpOperation(serverId, row.probeOp, {
          recordUsage: true,
        });
        const authChallenge = parseAuthRequiredError(response.result);
        if (authChallenge?.flow === "oauth" || authChallenge?.flow === "api_key") {
          onAuthRequired?.(authChallenge);
        }
        setRows((current) => ({
          ...current,
          [row.id]: {
            status: response.success ? "success" : "error",
            result: authChallenge ? "" : response.result,
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
    [disabled, onAuthRequired, serverId],
  );

  useImperativeHandle(
    ref,
    () => ({
      runAll: async () => {
        for (const row of TEST_ROWS) {
          await runTestForRow(row);
        }
      },
    }),
    [runTestForRow],
  );

  const runTest = useCallback(
    async (row: TestRowDef, event: MouseEvent) => {
      event.stopPropagation();
      await runTestForRow(row);
    },
    [runTestForRow],
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
        columns={[
          { key: "op", header: "Operation", headerStyle: { paddingRight: TEST_COLUMN_PAD } },
          { key: "status", header: "Status", headerStyle: { paddingRight: TEST_COLUMN_PAD } },
          { key: "result", header: "Result", headerStyle: { paddingRight: 8 } },
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
              <McpTableCell
                isLastRow={isLastRow}
                isRowExpanded={isExpanded}
                style={{ paddingRight: TEST_COLUMN_PAD }}
              >
                <McpTablePlainText
                  value={row.operation}
                  fontSize={13}
                  fontWeight={500}
                  isRowExpanded={isExpanded}
                />
              </McpTableCell>
              <McpTableCell
                isLastRow={isLastRow}
                isRowExpanded={isExpanded}
                style={{ paddingRight: TEST_COLUMN_PAD }}
              >
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
                  disabled={disabled}
                  onClick={(event) => void runTest(row, event)}
                />
              </McpTableCell>
            </McpTableRow>
          );
        })}
      </McpDataTable>
    </div>
  );
},
);
