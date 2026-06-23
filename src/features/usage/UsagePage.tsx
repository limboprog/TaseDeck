import { listen } from "@tauri-apps/api/event";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Button, Text, XStack, YStack } from "tamagui";
import { InlineLoader } from "../../components/InlineLoader";
import { PaneExpandableText, PaneView } from "../../components/pane";
import type { TablePickerOption } from "../../components/TablePicker";
import { listAgentRecords } from "../../services/agents/recordsApi";
import { useInstalledMcpServers } from "../../services/mcp_installed";
import { listUsageEntries, type UsageLogEntry } from "../../services/usage/usageApi";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import { pageContentInsets } from "../../styles/layout";
import {
  formatUsageCaller,
  formatUsageDate,
  formatUsageToolLabel,
  normalizeUsageCaller,
  USER_CALLER_VALUE,
} from "./formatUsageDate";
import { McpPanel } from "../mcp/McpPanel";
import { mcpTablePanelBodyText } from "../mcp/mcpTableStyles";
import { McpDataTable, McpTableRow } from "../mcp/table/McpDataTable";
import {
  McpTableCell,
  McpTableCopyAction,
  McpTableEmptyRow,
  McpTableFirstLine,
  McpTablePlainText,
} from "../mcp/table/McpTableCells";
import { UsageFilterBar } from "./UsageFilterBar";

const PAGE_SIZE = 30;

const USAGE_GRID =
  "minmax(140px, max-content) minmax(120px, max-content) minmax(104px, max-content) minmax(132px, max-content) minmax(72px, max-content) minmax(136px, 2fr)";
const COL_PAD = 16;
const STATUS_RESULT_GAP = 48;
const RESULT_CELL_PAD_LEFT = 20;
const RESULT_COPY_SLOT = 30;
const EXPANDED_RESULT_MAX_HEIGHT = 280;

type UsagePageProps = {
  usageActive?: boolean;
};

function statusLabel(success: boolean) {
  return success ? "Success" : "Error";
}

function statusColor(success: boolean) {
  return success ? "#2F9E62" : colors.errorSoft;
}

function matchesCallerFilter(entry: UsageLogEntry, selectedCallers: string[]) {
  if (selectedCallers.length === 0) {
    return true;
  }
  const caller = normalizeUsageCaller(entry.caller);
  return selectedCallers.some((value) => value.toLowerCase() === caller);
}

function matchesMcpFilter(entry: UsageLogEntry, selectedMcps: string[]) {
  if (selectedMcps.length === 0) {
    return true;
  }
  const mcpName = entry.mcpName.trim().toLowerCase();
  return selectedMcps.some((value) => value.toLowerCase() === mcpName);
}

export function UsagePage({ usageActive = true }: UsagePageProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevExpandedRowIdRef = useRef<string | null>(null);
  const { servers: installedMcps } = useInstalledMcpServers();
  const [entries, setEntries] = useState<UsageLogEntry[]>([]);
  const [agents, setAgents] = useState<TablePickerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedCallers, setSelectedCallers] = useState<string[]>([]);
  const [selectedMcps, setSelectedMcps] = useState<string[]>([]);

  const callerOptions = useMemo<TablePickerOption[]>(
    () => [
      { value: USER_CALLER_VALUE, label: "User" },
      ...agents.map((agent) => ({ value: agent.value, label: agent.label })),
    ],
    [agents],
  );

  const mcpOptions = useMemo<TablePickerOption[]>(
    () =>
      installedMcps
        .filter((server) => server.id > 0)
        .map((server) => ({
          value: server.name,
          label: server.name,
        })),
    [installedMcps],
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          matchesCallerFilter(entry, selectedCallers) &&
          matchesMcpFilter(entry, selectedMcps),
      ),
    [entries, selectedCallers, selectedMcps],
  );

  const toggleRow = useCallback((rowId: string) => {
    setExpandedRowId((current) => (current === rowId ? null : rowId));
  }, []);

  const handleTableMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-mcp-row-interactive]")) {
        return;
      }

      const rowHit = target.closest("[data-usage-row-id]");
      if (rowHit) {
        const rowId = rowHit.getAttribute("data-usage-row-id");
        if (rowId) {
          toggleRow(rowId);
        }
        return;
      }

      if (tableRef.current?.contains(target)) {
        setExpandedRowId(null);
      }
    },
    [toggleRow],
  );

  useEffect(() => {
    if (!usageActive || !expandedRowId) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (tableRef.current?.contains(target)) {
        return;
      }
      setExpandedRowId(null);
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [expandedRowId, usageActive]);

  useEffect(() => {
    if (!usageActive) {
      setExpandedRowId(null);
      setPage(0);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
      prevExpandedRowIdRef.current = null;
      return;
    }

    const previous = prevExpandedRowIdRef.current;
    if (previous && !expandedRowId) {
      const scrollEl = scrollRef.current;
      const tableEl = tableRef.current;
      if (scrollEl && tableEl) {
        const anchor = tableEl.querySelector(`[data-usage-row-anchor="${previous}"]`);
        if (anchor instanceof HTMLElement) {
          anchor.scrollIntoView({ block: "nearest", behavior: "auto" });
        } else {
          scrollEl.scrollTop = 0;
        }
      }
    }

    prevExpandedRowIdRef.current = expandedRowId;
  }, [expandedRowId, usageActive]);

  const total = filteredEntries.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = total === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const pageEnd = Math.min(total, (safePage + 1) * PAGE_SIZE);
  const pageEntries = filteredEntries.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const loadEntries = useCallback(async () => {
    try {
      const rows = await listUsageEntries(500);
      setEntries(rows);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const records = await listAgentRecords();
      setAgents(
        records.map((agent) => ({
          value: agent.name,
          label: agent.name,
        })),
      );
    } catch {
      setAgents([]);
    }
  }, []);

  useEffect(() => {
    if (page >= pageCount) {
      setPage(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  useEffect(() => {
    setExpandedRowId(null);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [safePage]);

  useEffect(() => {
    setPage(0);
    setExpandedRowId(null);
  }, [selectedCallers, selectedMcps]);

  useEffect(() => {
    if (!usageActive) {
      return;
    }
    setLoading(true);
    void loadEntries();
    void loadAgents();
  }, [loadAgents, loadEntries, usageActive]);

  useEffect(() => {
    if (!usageActive) {
      return;
    }

    let disposed = false;
    const unlistenPromise = listen("usage-log-updated", () => {
      if (!disposed) {
        void loadEntries();
      }
    });

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [loadEntries, usageActive]);

  const copyResult = useCallback(async (rowId: string, text: string, event: ReactMouseEvent) => {
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

  const addCaller = useCallback((value: string) => {
    setSelectedCallers((current) =>
      current.some((entry) => entry.toLowerCase() === value.toLowerCase())
        ? current
        : [...current, value],
    );
  }, []);

  const removeCaller = useCallback((value: string) => {
    setSelectedCallers((current) =>
      current.filter((entry) => entry.toLowerCase() !== value.toLowerCase()),
    );
  }, []);

  const addMcp = useCallback((value: string) => {
    setSelectedMcps((current) =>
      current.some((entry) => entry.toLowerCase() === value.toLowerCase())
        ? current
        : [...current, value],
    );
  }, []);

  const removeMcp = useCallback((value: string) => {
    setSelectedMcps((current) =>
      current.filter((entry) => entry.toLowerCase() !== value.toLowerCase()),
    );
  }, []);

  if (loading && entries.length === 0) {
    return (
      <YStack flex={1} justify="center" items="center" px={12}>
        <InlineLoader label="Loading usage…" />
      </YStack>
    );
  }

  const emptyMessage =
    entries.length === 0
      ? "No agent tool calls yet. Run a topology and invoke an MCP tool from your agent."
      : "No entries match the selected filters.";

  return (
    <PaneView
      flex={1}
      {...pageContentInsets}
      gap={12}
      toolbar={
        <UsageFilterBar
          callerOptions={callerOptions}
          mcpOptions={mcpOptions}
          selectedCallers={selectedCallers}
          selectedMcps={selectedMcps}
          onAddCaller={addCaller}
          onRemoveCaller={removeCaller}
          onAddMcp={addMcp}
          onRemoveMcp={removeMcp}
        />
      }
    >
      {error ? (
        <Text color={colors.error} fontSize={12} shrink={0}>
          {error}
        </Text>
      ) : null}

      <McpPanel flex={1} minH={0} p={0} overflow="hidden" display="flex" flexDirection="column">
        <div
          ref={scrollRef}
          className="td-scroll-y"
          style={{
            flex: 1,
            minHeight: 0,
            boxSizing: "border-box",
          }}
        >
          <div ref={tableRef} onMouseDown={handleTableMouseDown} style={{ width: "100%" }}>
          <McpDataTable
            bare
            shellStyle={{ width: "100%" }}
            gridColumns={USAGE_GRID}
            columns={[
              { key: "date", header: "Date", headerStyle: { paddingRight: COL_PAD } },
              { key: "mcp", header: "MCP", headerStyle: { paddingRight: COL_PAD } },
              { key: "caller", header: "Caller", headerStyle: { paddingRight: COL_PAD } },
              {
                key: "tool",
                header: "Tool",
                headerStyle: { paddingRight: STATUS_RESULT_GAP },
              },
              {
                key: "status",
                header: "Status",
                headerStyle: { paddingRight: COL_PAD },
              },
              {
                key: "result",
                header: "Result",
                headerStyle: {
                  paddingLeft: RESULT_CELL_PAD_LEFT,
                  paddingRight: COL_PAD + RESULT_COPY_SLOT,
                },
              },
            ]}
            empty={
              filteredEntries.length === 0 ? (
                <McpTableEmptyRow message={emptyMessage} />
              ) : undefined
            }
          >
            {pageEntries.map((entry, index) => {
              const rowId = String(entry.id);
              const isExpanded = expandedRowId === rowId;
              const isLastRow = index === pageEntries.length - 1;

              return (
                <McpTableRow key={rowId} rowId={rowId}>
                  <McpTableCell
                    isLastRow={isLastRow}
                    isRowExpanded={isExpanded}
                    style={{ paddingRight: COL_PAD }}
                  >
                    <div
                      data-usage-row-id={rowId}
                      data-usage-row-anchor={rowId}
                      style={{ width: "100%" }}
                    >
                      <McpTablePlainText
                        value={formatUsageDate(entry.createdAt)}
                        tone="panel"
                        isRowExpanded={isExpanded}
                      />
                    </div>
                  </McpTableCell>
                  <McpTableCell
                    isLastRow={isLastRow}
                    isRowExpanded={isExpanded}
                    style={{ paddingRight: COL_PAD, minWidth: 0 }}
                  >
                    <div data-usage-row-id={rowId} style={{ width: "100%", minWidth: 0 }}>
                      <McpTablePlainText
                        value={entry.mcpName}
                        tone="panel"
                        isRowExpanded={isExpanded}
                      />
                    </div>
                  </McpTableCell>
                  <McpTableCell
                    isLastRow={isLastRow}
                    isRowExpanded={isExpanded}
                    style={{ paddingRight: COL_PAD, minWidth: 0 }}
                  >
                    <div data-usage-row-id={rowId} style={{ width: "100%", minWidth: 0 }}>
                      <McpTablePlainText
                        value={formatUsageCaller(entry.caller)}
                        tone="panel"
                        isRowExpanded={isExpanded}
                      />
                    </div>
                  </McpTableCell>
                  <McpTableCell
                    isLastRow={isLastRow}
                    isRowExpanded={isExpanded}
                    style={{ paddingRight: STATUS_RESULT_GAP, minWidth: 0 }}
                  >
                    <div data-usage-row-id={rowId} style={{ width: "100%", minWidth: 0 }}>
                      <McpTablePlainText
                        value={formatUsageToolLabel(entry.toolName)}
                        tone="panel"
                        isRowExpanded={isExpanded}
                      />
                    </div>
                  </McpTableCell>
                  <McpTableCell
                    isLastRow={isLastRow}
                    isRowExpanded={isExpanded}
                    style={{ paddingRight: COL_PAD }}
                  >
                    <div data-usage-row-id={rowId} style={{ width: "100%" }}>
                      <McpTableFirstLine>
                        <span
                          style={{
                            ...mcpTablePanelBodyText,
                            color: statusColor(entry.success),
                            whiteSpace: "nowrap",
                          }}
                        >
                          {statusLabel(entry.success)}
                        </span>
                      </McpTableFirstLine>
                    </div>
                  </McpTableCell>
                  <McpTableCell
                    isLastRow={isLastRow}
                    isRowExpanded={isExpanded}
                    style={{
                      paddingLeft: RESULT_CELL_PAD_LEFT,
                      paddingRight: COL_PAD,
                      minWidth: 0,
                      overflow: "hidden",
                    }}
                  >
                    {entry.result ? (
                      <div
                        data-usage-row-id={rowId}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          width: "100%",
                          minWidth: 0,
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            flex: "1 1 0",
                            minWidth: 0,
                            overflow: isExpanded ? "auto" : "hidden",
                            maxHeight: isExpanded ? EXPANDED_RESULT_MAX_HEIGHT : undefined,
                            paddingRight: 4,
                          }}
                          onMouseDown={(event) => {
                            if (isExpanded) {
                              event.stopPropagation();
                            }
                          }}
                        >
                          <PaneExpandableText
                            value={entry.result}
                            expanded={isExpanded}
                            color={colors.panelForeground}
                            fontSize={12}
                            monospace
                            maxHeight={EXPANDED_RESULT_MAX_HEIGHT}
                          />
                        </div>
                        <div style={{ flexShrink: 0, marginTop: 2 }}>
                          <McpTableCopyAction
                            copied={copiedRowId === rowId}
                            onClick={(event) => void copyResult(rowId, entry.result, event)}
                          />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: colors.muted, fontSize: 13 }}>—</span>
                    )}
                  </McpTableCell>
                </McpTableRow>
              );
            })}
          </McpDataTable>
          </div>
        </div>

        {total > 0 ? (
          <XStack
            px={12}
            py={10}
            items="center"
            justify="space-between"
            shrink={0}
            borderTopWidth={1}
            borderTopColor={borders.default as never}
          >
            <Text color={colors.muted} fontSize={12} select="none">
              {pageStart}-{pageEnd} of {total}
            </Text>
            <XStack gap={8} items="center">
              <Button
                unstyled
                px={10}
                py={5}
                rounded={6}
                disabled={safePage <= 0}
                opacity={safePage <= 0 ? 0.45 : 1}
                bg={tamaguiSurfaces.controlBg}
                borderWidth={1}
                borderColor={borders.default as never}
                hoverStyle={{ bg: tamaguiSurfaces.controlHoverBg }}
                onPress={() => setPage((current) => Math.max(0, current - 1))}
              >
                <Text color={colors.foreground} fontSize={12} fontWeight={500} select="none">
                  Prev
                </Text>
              </Button>
              <Text color={colors.muted} fontSize={12} minW={36} text="center" select="none">
                {safePage + 1}/{pageCount}
              </Text>
              <Button
                unstyled
                px={10}
                py={5}
                rounded={6}
                disabled={safePage >= pageCount - 1}
                opacity={safePage >= pageCount - 1 ? 0.45 : 1}
                bg={tamaguiSurfaces.controlBg}
                borderWidth={1}
                borderColor={borders.default as never}
                hoverStyle={{ bg: tamaguiSurfaces.controlHoverBg }}
                onPress={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              >
                <Text color={colors.foreground} fontSize={12} fontWeight={500} select="none">
                  Next
                </Text>
              </Button>
            </XStack>
          </XStack>
        ) : null}
      </McpPanel>
    </PaneView>
  );
}
