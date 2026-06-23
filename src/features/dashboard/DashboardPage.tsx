import { listen } from "@tauri-apps/api/event";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { IoPrism, IoSearch, IoServerOutline, PiBrain } from "../../icons";
import { Text, XStack, YStack } from "tamagui";
import { InlineLoader } from "../../components/InlineLoader";
import type { NavId } from "../../components/Sidebar/Sidebar";
import {
  AGENTS_CHANGED_EVENT,
  listAgentRecords,
  type AgentRecord,
} from "../../services/agents/recordsApi";
import { listInstalledMcpServers } from "../../services/mcp_installed/api";
import {
  MCP_INSTALLED_EVENT,
  MCP_REMOVED_EVENT,
  type InstalledMcpServer,
} from "../../services/mcp_installed/types";
import { getStoredTopologies } from "../../services/topology/storage";
import { getTopologyRunStatus } from "../../services/topology/topologyRunApi";
import type { Topology } from "../../services/topology/types";
import { listUsageEntries, type UsageLogEntry } from "../../services/usage/usageApi";
import { initRegistryWorker, registrySearch } from "../../services/mcp_registry";
import {
  defaultMcpPageSession,
  defaultWorkspacePageSession,
  readPageSession,
  writePageSession,
} from "../../session/appSession";
import { formatUsageDate } from "../usage/formatUsageDate";
import { mcpTableBackground } from "../mcp/mcpTableStyles";
import { borders, colors, surfaces, tamaguiSurfaces } from "../../theme";
import { McpPanel } from "../mcp/McpPanel";
import { McpDataTable, McpTableRow } from "../mcp/table/McpDataTable";
import {
  McpTableCell,
  McpTableEmptyRow,
  McpTableFirstLine,
  McpTablePlainText,
} from "../mcp/table/McpTableCells";

const WORKSPACE_PAGE_SESSION_KEY = "workspace";
const MCP_PAGE_SESSION_KEY = "mcp-installed";
const RECENT_CALLS_GRID =
  "minmax(132px, max-content) minmax(0, 1fr) minmax(0, 0.8fr) minmax(92px, max-content)";

type TopologyEntry = {
  topology: Topology;
};

type DashboardPageProps = {
  dashboardActive?: boolean;
  onNavigate: (id: NavId) => void;
};

function statusLabel(success: boolean) {
  return success ? "Success" : "Error";
}

function statusColor(success: boolean) {
  return success ? colors.success : colors.error;
}

function CardHeading({ children }: { children: string }) {
  return (
    <Text color={colors.foreground} fontSize={17} fontWeight="700" select="none">
      {children}
    </Text>
  );
}

function AccentLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      onMouseEnter={(event) => {
        event.currentTarget.style.opacity = "0.85";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.opacity = "1";
      }}
      style={{
        alignSelf: "flex-start",
        padding: 0,
        border: "none",
        background: "transparent",
        color: colors.accent,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      {label}
    </button>
  );
}

function AccentButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      onMouseEnter={(event) => {
        event.currentTarget.style.opacity = "0.85";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.opacity = "1";
      }}
      style={{
        alignSelf: "flex-start",
        height: 32,
        padding: "0 12px",
        borderRadius: 8,
        border: "none",
        background: colors.accent,
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        lineHeight: "32px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function MarketCardButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 54,
        height: 30,
        margin: 0,
        padding: "0 10px",
        borderRadius: 999,
        border: `1px solid ${tamaguiSurfaces.controlHoverBg}`,
        background: surfaces.card,
        color: colors.muted,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        cursor: "pointer",
        fontFamily: "inherit",
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

function PreviewRow({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <XStack items="center" gap={10} minW={0}>
      {icon}
      <Text color={colors.muted} fontSize={14} fontWeight="500" numberOfLines={1} flex={1}>
        {label}
      </Text>
    </XStack>
  );
}

function dashboardBlockShell(hovered: boolean): CSSProperties {
  return {
    borderRadius: 8,
    border: `1px solid ${hovered ? borders.focus : borders.default}`,
    background: hovered ? tamaguiSurfaces.controlHoverBg : mcpTableBackground,
    transition: "background 120ms ease, border-color 120ms ease",
    boxSizing: "border-box",
  };
}

function quickActionBlockStyle(hovered: boolean): CSSProperties {
  return {
    ...dashboardBlockShell(hovered),
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: 240,
    maxWidth: "100%",
    height: 32,
    padding: "0 10px",
    cursor: "text",
    fontFamily: "inherit",
    margin: 0,
    color: "inherit",
  };
}

function topologyBlockStyle(hovered: boolean): CSSProperties {
  return {
    ...dashboardBlockShell(hovered),
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
    padding: "10px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    appearance: "none",
    margin: 0,
    color: "inherit",
  };
}

function BrowseMarketBlock({ onSearch }: { onSearch: (query: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [query, setQuery] = useState("");

  const submit = () => {
    onSearch(query.trim());
  };

  return (
    <div
      style={quickActionBlockStyle(hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label="Search servers"
        onClick={submit}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <IoSearch size={16} color={colors.muted} />
      </button>
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="browse servers"
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          color: colors.muted,
          fontSize: 14,
          fontWeight: 500,
          fontFamily: "inherit",
          padding: 0,
        }}
      />
    </div>
  );
}

function TopologyRow({
  entry,
  onOpen,
}: {
  entry: TopologyEntry;
  onOpen: (topologyId: string) => void;
}) {
  const { topology } = entry;
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onOpen(topology.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={topologyBlockStyle(hovered)}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
          flex: 1,
        }}
      >
        <IoPrism size={16} color={colors.muted} aria-hidden />
        <span
          style={{
            color: colors.muted,
            fontSize: 14,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {topology.name}
        </span>
      </span>
      {topology.running ? (
        <span
          style={{
            color: colors.success,
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          Active
        </span>
      ) : null}
    </button>
  );
}

export function DashboardPage({ dashboardActive = true, onNavigate }: DashboardPageProps) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [servers, setServers] = useState<InstalledMcpServer[]>([]);
  const [topologyEntries, setTopologyEntries] = useState<TopologyEntry[]>([]);
  const [usageEntries, setUsageEntries] = useState<UsageLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    try {
      setAgents(await listAgentRecords());
    } catch {
      setAgents([]);
    }
  }, []);

  const loadServers = useCallback(async () => {
    try {
      setServers(await listInstalledMcpServers());
    } catch {
      setServers([]);
    }
  }, []);

  const loadTopologies = useCallback(async () => {
    const stored = getStoredTopologies();
    const entries = await Promise.all(
      stored.map(async (topology) => {
        try {
          const status = await getTopologyRunStatus(topology.id, topology.name);
          return {
            topology: { ...topology, running: status.running },
          };
        } catch {
          return { topology };
        }
      }),
    );
    setTopologyEntries(entries);
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const rows = await listUsageEntries(4);
      setUsageEntries(rows.slice(0, 4));
    } catch {
      setUsageEntries([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadAgents(), loadServers(), loadTopologies(), loadUsage()]);
    setLoading(false);
  }, [loadAgents, loadServers, loadTopologies, loadUsage]);

  const openTopology = useCallback(
    (topologyId: string) => {
      writePageSession(WORKSPACE_PAGE_SESSION_KEY, {
        ...defaultWorkspacePageSession(),
        selectedTopologyId: topologyId,
      });
      onNavigate("presets");
    },
    [onNavigate],
  );

  const browseServers = useCallback(
    (query: string) => {
      initRegistryWorker();
      registrySearch(query);
      const stored = readPageSession(MCP_PAGE_SESSION_KEY, defaultMcpPageSession());
      writePageSession(MCP_PAGE_SESSION_KEY, { ...stored, search: query });
      onNavigate("mcp");
    },
    [onNavigate],
  );

  const openAddMcpConfig = useCallback(() => {
    const stored = readPageSession(MCP_PAGE_SESSION_KEY, defaultMcpPageSession());
    writePageSession(MCP_PAGE_SESSION_KEY, { ...stored, pendingManualDraft: true });
    onNavigate("mcp");
  }, [onNavigate]);

  useEffect(() => {
    if (!dashboardActive) {
      return;
    }
    setLoading(true);
    void refresh();
  }, [dashboardActive, refresh]);

  useEffect(() => {
    if (!dashboardActive) {
      return;
    }

    const onAgentsChanged = () => void loadAgents();
    window.addEventListener(AGENTS_CHANGED_EVENT, onAgentsChanged);
    return () => window.removeEventListener(AGENTS_CHANGED_EVENT, onAgentsChanged);
  }, [dashboardActive, loadAgents]);

  useEffect(() => {
    if (!dashboardActive) {
      return;
    }

    const onMcpChanged = () => void loadServers();
    window.addEventListener(MCP_INSTALLED_EVENT, onMcpChanged);
    window.addEventListener(MCP_REMOVED_EVENT, onMcpChanged);
    return () => {
      window.removeEventListener(MCP_INSTALLED_EVENT, onMcpChanged);
      window.removeEventListener(MCP_REMOVED_EVENT, onMcpChanged);
    };
  }, [dashboardActive, loadServers]);

  useEffect(() => {
    if (!dashboardActive) {
      return;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === "tasedeck:topologies") {
        void loadTopologies();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [dashboardActive, loadTopologies]);

  useEffect(() => {
    if (!dashboardActive) {
      return;
    }

    let disposed = false;
    const unlistenPromise = listen("usage-log-updated", () => {
      if (!disposed) {
        void loadUsage();
      }
    });

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [dashboardActive, loadUsage]);

  const previewAgents = useMemo(() => agents.slice(0, 2), [agents]);
  const previewServers = useMemo(() => servers.slice(0, 2), [servers]);
  const previewTopologies = useMemo(
    () =>
      [...topologyEntries]
        .sort((a, b) => b.topology.updatedAt.localeCompare(a.topology.updatedAt))
        .slice(0, 3),
    [topologyEntries],
  );
  const hasTopologies = topologyEntries.length > 0;

  if (loading) {
    return (
      <YStack flex={1} justify="center" items="center" px={12}>
        <InlineLoader label="Loading dashboard…" />
      </YStack>
    );
  }

  return (
    <YStack flex={1} minH={0} overflow="hidden" px={16} py={14} gap={12}>
      <Text color={colors.foreground} fontSize={22} fontWeight="700" select="none">
        Dashboard
      </Text>

      <div
        className="td-scroll-y"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          paddingBottom: 8,
        }}
      >
        <XStack gap={12} flexWrap="wrap" items="stretch">
          <McpPanel flex={1} minW={280} p={16} gap={14}>
            <CardHeading>Agents</CardHeading>
            {previewAgents.length > 0 ? (
              <YStack gap={10}>
                {previewAgents.map((agent) => (
                  <PreviewRow
                    key={agent.id}
                    icon={<PiBrain size={18} color={colors.muted} />}
                    label={agent.name}
                  />
                ))}
              </YStack>
            ) : (
              <Text color={colors.muted} fontSize={13} lineHeight={20} select="none">
                Use any agent
              </Text>
            )}
            <AccentButton label="Add project" onPress={() => onNavigate("projects")} />
          </McpPanel>

          <McpPanel flex={1} minW={280} p={16} gap={14}>
            <CardHeading>Servers</CardHeading>
            {previewServers.length > 0 ? (
              <YStack gap={10}>
                {previewServers.map((server) => (
                  <PreviewRow
                    key={server.id}
                    icon={<IoServerOutline size={18} color={colors.muted} />}
                    label={server.name}
                  />
                ))}
              </YStack>
            ) : (
              <Text color={colors.muted} fontSize={13} lineHeight={20} select="none">
                Install MCP servers from the catalog in one click
              </Text>
            )}
            <AccentButton label="Browse servers" onPress={() => onNavigate("mcp")} />
          </McpPanel>
        </XStack>

        <McpPanel p={16} gap={14} items="flex-start">
          <CardHeading>Active topologies</CardHeading>
          {previewTopologies.length > 0 ? (
            <YStack gap={8} width="100%">
              {previewTopologies.map((entry) => (
                <TopologyRow key={entry.topology.id} entry={entry} onOpen={openTopology} />
              ))}
            </YStack>
          ) : !hasTopologies ? (
            <Text color={colors.muted} fontSize={13} lineHeight={20} select="none">
              Configurate your own topology
            </Text>
          ) : null}
          <AccentLink label="Create preset" onPress={() => onNavigate("presets")} />
        </McpPanel>

        <McpPanel p={16} gap={14} items="flex-start">
          <CardHeading>Recent calls</CardHeading>
          <McpDataTable
            shellStyle={{ width: "100%" }}
            gridColumns={RECENT_CALLS_GRID}
            columns={[
              { key: "date", header: "Date", headerStyle: { paddingRight: 16 } },
              { key: "mcp", header: "MCP", headerStyle: { paddingRight: 20 } },
              { key: "tool", header: "Tool", headerStyle: { paddingRight: 20 } },
              { key: "status", header: "Status" },
            ]}
            empty={
              usageEntries.length === 0 ? (
                <McpTableEmptyRow message="No calls yet." />
              ) : undefined
            }
          >
            {usageEntries.map((entry, index) => {
              const isLastRow = index === usageEntries.length - 1;
              return (
                <McpTableRow key={entry.id} rowId={String(entry.id)}>
                  <McpTableCell isLastRow={isLastRow} style={{ paddingRight: 16 }}>
                    <McpTablePlainText
                      value={formatUsageDate(entry.createdAt)}
                      fontSize={12}
                      fontWeight={400}
                      monospace
                    />
                  </McpTableCell>
                  <McpTableCell isLastRow={isLastRow} style={{ paddingRight: 20 }}>
                    <McpTablePlainText value={entry.mcpName} fontSize={13} fontWeight={400} />
                  </McpTableCell>
                  <McpTableCell isLastRow={isLastRow} style={{ paddingRight: 20 }}>
                    <McpTablePlainText value={entry.toolName} fontSize={13} fontWeight={400} />
                  </McpTableCell>
                  <McpTableCell isLastRow={isLastRow}>
                    <McpTableFirstLine>
                      <span
                        style={{
                          color: statusColor(entry.success),
                          fontSize: 12,
                          fontWeight: 400,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {statusLabel(entry.success)}
                      </span>
                    </McpTableFirstLine>
                  </McpTableCell>
                </McpTableRow>
              );
            })}
          </McpDataTable>
          <AccentLink label="Read more" onPress={() => onNavigate("usage")} />
        </McpPanel>

        <McpPanel p={16} gap={12} items="flex-start">
          <CardHeading>Quick actions</CardHeading>
          <XStack gap={10} items="center" flexWrap="wrap">
            <BrowseMarketBlock onSearch={browseServers} />
            <MarketCardButton label="Add MCP config" onPress={openAddMcpConfig} />
          </XStack>
        </McpPanel>
      </div>
    </YStack>
  );
}
