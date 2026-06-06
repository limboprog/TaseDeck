import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Text, YStack } from "tamagui";
import { ListPaginationFooter } from "../../components/ListPaginationFooter";
import { McpPanel } from "./McpPanel";
import { McpInlineSearch } from "./McpInlineSearch";
import { type McpServerEntry, useMcpRegistry } from "../../services/mcp_registry";
import {
  buildInstalledPathSet,
  InstalledMcpPathsProvider,
  useInstalledMcpServers,
} from "../../services/mcp_installed";
import { colors, surfaces } from "../../theme";
import { McpServerDetailPage } from "./McpServerDetailPage";
import { McpSourceTabs } from "./McpSourceTabs";
import { McpRegistryGrid } from "./McpRegistryGrid";

const PAGE_SIZE = 60;

const EMPTY_MESSAGES = {
  all: "No servers found in the official registry.",
  local: "No local package-based servers match your search.",
  remote: "No remote connection servers match your search.",
} as const;

export function McpRegistryPage() {
  const [selectedEntry, setSelectedEntry] = useState<McpServerEntry | null>(null);
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

  const pageItemCount = pageServers.length;
  const showEmpty =
    !loading && !error && pageItemCount === 0 && (!hasMore || totalFiltered === 0);
  const showGrid = pageItemCount > 0;
  const showLoadingMore = loading && pageItemCount === 0 && !error;

  const pageStart = pageItemCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = pageItemCount === 0 ? 0 : page * PAGE_SIZE + pageItemCount;
  const paginationTotal = hasMore
    ? Math.max(totalFiltered, pageEnd)
    : totalFiltered;

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

  const searchHint = isCachePreview
    ? "Показываем совпадения из кеша, загружаем актуальные…"
    : loading
      ? "Загрузка…"
      : "Поиск по name и title. All / Local / Remote — фильтр по типу подключения.";

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
              <Text color={colors.muted} fontSize={12} px={2} select="none">
                {searchHint}
              </Text>
              <McpSourceTabs value={source} options={sourceOptions} onChange={setSource} />
            </YStack>

            <div
              ref={scrollRef}
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                overflow: "auto",
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

              {showLoadingMore ? (
                <Text color={colors.muted} fontSize={14} px={2} select="none" shrink={0}>
                  Loading servers…
                </Text>
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
