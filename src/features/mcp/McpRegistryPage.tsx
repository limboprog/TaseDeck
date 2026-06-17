import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Button, Text, YStack } from "tamagui";
import { InlineLoader } from "../../components/InlineLoader";
import { ListPaginationFooter } from "../../components/ListPaginationFooter";
import { McpPanel } from "./McpPanel";
import { McpInlineSearch } from "./McpInlineSearch";
import {
  initRegistryWorker,
  MARKET_PAGE_SIZE,
  registrySearch,
  type McpServerEntry,
  useMcpRegistry,
} from "../../services/mcp_registry";
import { fetchRegistryServerByKey } from "../../services/mcp_registry/registryFetch";
import { findRegistryEntryByName } from "../../services/mcp_registry/searchCore";
import {
  fetchRegistryEntryForInstalled,
  findRegistryEntryByRegistryKey,
} from "../../services/mcp_installed/registryConfig";
import {
  defaultMarketPageSession,
  MARKET_PAGE_SESSION_KEY,
  readPageSession,
  writePageSession,
} from "../../session/appSession";
import {
  buildInstalledPathSet,
  InstalledMcpPathsProvider,
  useInstalledMcpServers,
} from "../../services/mcp_installed";
import { colors, surfaces } from "../../theme";
import { McpServerDetailPage } from "./McpServerDetailPage";
import { McpSourceTabs } from "./McpSourceTabs";
import { McpRegistryGrid } from "./McpRegistryGrid";

const EMPTY_MESSAGES = {
  all: "No servers found in the official registry.",
  local: "No local package-based servers match your search.",
  remote: "No remote connection servers match your search.",
} as const;

type McpRegistryPageProps = {
  marketActive?: boolean;
};

type PendingMarketDetail = {
  registryKey: string | null;
  serverId: number | null;
  serverName: string | null;
};

export function McpRegistryPage({ marketActive = true }: McpRegistryPageProps) {
  const [selectedEntry, setSelectedEntry] = useState<McpServerEntry | null>(null);
  const [openingDetail, setOpeningDetail] = useState(false);
  const pendingDetailRef = useRef<PendingMarketDetail>({
    registryKey: null,
    serverId: null,
    serverName: null,
  });
  const { servers: installedServers } = useInstalledMcpServers();
  const installedPaths = useMemo(
    () => buildInstalledPathSet(installedServers),
    [installedServers],
  );
  const {
    source,
    setSource,
    query,
    setQuery,
    page,
    pageCount,
    pageServers,
    totalFiltered,
    setPage,
    loading,
    isCachePreview,
    error,
    hasMore,
    refresh,
    sourceOptions,
  } = useMcpRegistry();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  useEffect(() => {
    setSelectedEntry(null);
  }, [query]);

  const consumePendingMarketDetail = useCallback(() => {
    const session = readPageSession(
      MARKET_PAGE_SESSION_KEY,
      defaultMarketPageSession(),
    );
    const registryKey = session.pendingDetailRegistryKey?.trim() || null;
    const serverId = session.pendingDetailServerId ?? null;
    const serverName = session.pendingDetailServerName?.trim() || null;
    if (!registryKey && !serverId && !serverName) {
      return;
    }
    writePageSession(MARKET_PAGE_SESSION_KEY, defaultMarketPageSession());
    pendingDetailRef.current = { registryKey, serverId, serverName };
    initRegistryWorker();
    if (!registryKey && !serverId && serverName) {
      setSource("all");
      registrySearch(serverName);
    }
  }, [setSource]);

  useEffect(() => {
    if (!marketActive) {
      return;
    }
    consumePendingMarketDetail();
  }, [consumePendingMarketDetail, marketActive]);

  useEffect(() => {
    const pending = pendingDetailRef.current;
    if (selectedEntry) {
      return;
    }

    if (pending.registryKey || pending.serverId) {
      let cancelled = false;
      setOpeningDetail(true);

      void (async () => {
        let entry: McpServerEntry | null = null;

        if (pending.registryKey) {
          entry =
            findRegistryEntryByRegistryKey(pending.registryKey) ??
            (await fetchRegistryServerByKey(pending.registryKey));
        } else if (pending.serverId) {
          const installed = installedServers.find(
            (server) => server.id === pending.serverId,
          );
          if (installed) {
            entry = await fetchRegistryEntryForInstalled(installed);
          }
        }

        if (cancelled) {
          return;
        }
        if (entry) {
          setSelectedEntry(entry);
        }
        pendingDetailRef.current = {
          registryKey: null,
          serverId: null,
          serverName: null,
        };
        setOpeningDetail(false);
      })();

      return () => {
        cancelled = true;
      };
    }

    if (!pending.serverName || loading) {
      return;
    }

    const match = findRegistryEntryByName(pageServers, pending.serverName);
    if (match) {
      setSelectedEntry(match);
      pendingDetailRef.current = {
        registryKey: null,
        serverId: null,
        serverName: null,
      };
      return;
    }
    if (pageServers.length === 0 && !hasMore) {
      pendingDetailRef.current = {
        registryKey: null,
        serverId: null,
        serverName: null,
      };
    }
  }, [hasMore, installedServers, loading, pageServers, selectedEntry]);

  const pageItemCount = pageServers.length;
  const showEmpty =
    !loading && !error && pageItemCount === 0 && (!hasMore || totalFiltered === 0);
  const showGrid = pageItemCount > 0;
  const showLoading = loading && pageItemCount === 0;
  const showLoadingOverlay = loading && pageItemCount > 0 && isCachePreview;

  const pageStart = pageItemCount === 0 ? 0 : page * MARKET_PAGE_SIZE + 1;
  const pageEnd = pageItemCount === 0 ? 0 : page * MARKET_PAGE_SIZE + pageItemCount;
  const paginationTotal = hasMore
    ? Math.max(totalFiltered, pageEnd)
    : totalFiltered;

  if (openingDetail && !selectedEntry) {
    return (
      <YStack flex={1} minH={0} px={16} py={14}>
        <InlineLoader label="Opening server details…" minHeight={120} />
      </YStack>
    );
  }

  if (selectedEntry) {
    return (
      <InstalledMcpPathsProvider installedPaths={installedPaths}>
        <YStack flex={1} minH={0} minW={0} width="100%" px={16} py={14}>
          <McpServerDetailPage
            entry={selectedEntry}
            onBack={() => setSelectedEntry(null)}
          />
        </YStack>
      </InstalledMcpPathsProvider>
    );
  }

  return (
    <InstalledMcpPathsProvider installedPaths={installedPaths}>
      <YStack flex={1} minH={0} minW={0} overflow="hidden" px={16} py={14} gap={12}>
        <Text color={colors.foreground} fontSize={22} fontWeight="700" select="none">
          Market
        </Text>

        <McpPanel flex={1} minH={0} p={0} overflow="hidden">
          <YStack flex={1} minH={0} minW={0}>
            <YStack px={16} pt={16} pb={12} gap={10} shrink={0}>
              <McpInlineSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Search MCP servers…"
              />
              <McpSourceTabs value={source} options={sourceOptions} onChange={setSource} />
            </YStack>

            <div
              ref={scrollRef}
              className="td-scroll-y"
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: "0 16px 16px",
              }}
            >
              {error ? (
                <YStack gap={8} px={2} shrink={0}>
                  <Text color={colors.error} fontSize={14}>
                    {error}
                  </Text>
                  <Button
                    unstyled
                    self="flex-start"
                    px={12}
                    py={8}
                    rounded={8}
                    bg={surfaces.card}
                    onPress={refresh}
                  >
                    <Text color={colors.foreground} fontSize={13}>
                      Retry
                    </Text>
                  </Button>
                </YStack>
              ) : null}

              {showLoading ? (
                <InlineLoader label="Loading servers…" minHeight={120} />
              ) : null}

              {showLoadingOverlay ? (
                <YStack shrink={0} pb={4}>
                  <InlineLoader label="Loading servers…" minHeight={48} />
                </YStack>
              ) : null}

              {showEmpty ? (
                <Text color={colors.muted} fontSize={14} px={2} select="none" shrink={0}>
                  {EMPTY_MESSAGES[source]}
                </Text>
              ) : null}

              {showGrid ? (
                <McpRegistryGrid
                  servers={pageServers}
                  onSelect={setSelectedEntry}
                />
              ) : null}

              {paginationTotal > 0 || pageItemCount > 0 ? (
                <YStack shrink={0} pt={4}>
                  <ListPaginationFooter
                    pageStart={pageStart}
                    pageEnd={pageEnd}
                    total={paginationTotal}
                    page={page}
                    pageCount={pageCount}
                    hasMore={hasMore}
                    onPageChange={setPage}
                  />
                </YStack>
              ) : null}
            </div>
          </YStack>
        </McpPanel>
      </YStack>
    </InstalledMcpPathsProvider>
  );
}
