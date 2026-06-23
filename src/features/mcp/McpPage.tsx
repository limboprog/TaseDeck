import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IoAdd } from "../../icons";
import { Button, Text, XStack, YStack } from "tamagui";
import { ScrollFadePanel } from "../../components/ScrollFadePanel/ScrollFadePanel";
import { ToolbarIconButton } from "../../components/pane";
import { InlineLoader } from "../../components/InlineLoader";
import { ListPaginationFooter } from "../../components/ListPaginationFooter";
import { McpPanel } from "./McpPanel";
import { McpInlineSearch } from "./McpInlineSearch";
import { McpServerListCard } from "./McpServerListCard";
import { McpInstalledListCard } from "./McpInstalledListCard";
import { McpDetailPanel } from "./McpDetailPanel";
import { McpCreateRow } from "./McpCreateRow";
import { enableMcpAuthPrompt } from "./mcpAuthPromptSession";
import { McpListCollapsibleSection } from "./McpListSection";
import { createManualMcpDraft } from "./createManualMcpDraft";
import {
  initRegistryWorker,
  MARKET_PAGE_SIZE,
  registrySearch,
  entryKey,
  type McpServerEntry,
  useMcpRegistry,
} from "../../services/mcp_registry";
import { fetchRegistryServerByKey } from "../../services/mcp_registry/registryFetch";
import { findRegistryEntryByName } from "../../services/mcp_registry/searchCore";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import {
  buildInstalledPathSet,
  findInstalledServerForEntry,
  InstalledMcpPathsProvider,
  resolveRegistryEntryFromInstalled,
  fetchRegistryEntryForInstalled,
  findRegistryEntryByRegistryKey,
  useInstalledMcpServers,
} from "../../services/mcp_installed";
import { removeInstalledMcpServer, addInstalledMcpServer } from "../../services/mcp_installed/api";
import { startMcpOAuthSignIn } from "../../services/mcp_installed/oauthApi";
import { setCachedMcpToolsSnapshot } from "../../services/mcp_installed/mcpToolsSnapshotCache";
import { refreshMcpTools } from "../../services/mcp_installed/toolsApi";
import {
  defaultMcpPageSession,
  readPageSession,
  writePageSession,
  type McpPageSession,
} from "../../session/appSession";
import { colors, surfaces } from "../../theme";
import { pageContentInsets } from "../../styles/layout";
import { APP_OPEN_MCP_SERVER_EVENT } from "../../navigation/appNavigation";
import {
  linkInstalledToRegistry,
  rememberRegistryEntries,
  rememberRegistryEntry,
  resolveInstalledListDescription,
} from "./mcpDescriptionCache";
import { clampScrollParentAndRevealAnchor } from "./detailPanelScroll";
import { useMcpInstalledConnectionStatuses } from "./useMcpInstalledConnectionStatuses";

const MCP_PAGE_SESSION_KEY = "mcp-installed";
const LIST_WIDTH = 300;

type McpPageProps = {
  mcpActive?: boolean;
};

type PendingDetail = {
  registryKey: string | null;
  serverId: number | null;
  serverName: string | null;
};

type Selection =
  | { kind: "registry"; key: string }
  | { kind: "installed"; id: number }
  | null;

function selectionFromSession(session: McpPageSession): Selection {
  if (session.selectedInstalledId != null) {
    return { kind: "installed", id: session.selectedInstalledId };
  }
  if (session.selectedRegistryKey) {
    return { kind: "registry", key: session.selectedRegistryKey };
  }
  return null;
}

function toSelectionToken(selection: Selection): string | null {
  if (!selection) {
    return null;
  }
  if (selection.kind === "registry") {
    return `r:${selection.key}`;
  }
  return `i:${selection.id}`;
}

export function McpPage({ mcpActive = true }: McpPageProps) {
  const { servers: installedServers, loading: installedLoading, error: installedError, refresh } =
    useInstalledMcpServers();
  const installedPaths = useMemo(
    () => buildInstalledPathSet(installedServers),
    [installedServers],
  );

  const [session, setSession] = useState<McpPageSession>(() =>
    readPageSession(MCP_PAGE_SESSION_KEY, defaultMcpPageSession()),
  );
  const [creatingManual, setCreatingManual] = useState(false);
  const [createDraftName, setCreateDraftName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(() => selectionFromSession(session));
  const [fetchedEntry, setFetchedEntry] = useState<{
    token: string;
    entry: McpServerEntry;
  } | null>(null);
  const [refreshingListId, setRefreshingListId] = useState<number | null>(null);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [docsScrollSignal, setDocsScrollSignal] = useState(0);
  const [detailScrollResetSignal, setDetailScrollResetSignal] = useState(0);
  const pendingDetailRef = useRef<PendingDetail>({
    registryKey: null,
    serverId: null,
    serverName: null,
  });
  const listScrollRef = useRef<HTMLDivElement>(null);
  const marketSectionRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    page,
    pageCount,
    pageServers,
    totalFiltered,
    setPage,
    loading: registryLoading,
    isCachePreview,
    error: registryError,
    hasMore,
    refresh: refreshRegistry,
  } = useMcpRegistry();

  const { statuses: connectionStatuses, refreshStatus: refreshConnectionStatus } =
    useMcpInstalledConnectionStatuses(installedServers);

  const selectionToken = toSelectionToken(selection);

  useEffect(() => {
    rememberRegistryEntries(pageServers);
    for (const server of installedServers) {
      const registryEntry = resolveRegistryEntryFromInstalled(server);
      if (registryEntry) {
        rememberRegistryEntry(registryEntry);
        linkInstalledToRegistry(server.id, entryKey(registryEntry));
        resolveInstalledListDescription(server.id, registryEntry);
      } else {
        resolveInstalledListDescription(server.id, null);
      }
    }
  }, [installedServers, pageServers]);

  useEffect(() => {
    const stored = readPageSession(MCP_PAGE_SESSION_KEY, defaultMcpPageSession());
    writePageSession(MCP_PAGE_SESSION_KEY, {
      ...session,
      selectedRegistryKey:
        selection?.kind === "registry" ? selection.key : null,
      selectedInstalledId:
        selection?.kind === "installed" ? selection.id : null,
      pendingDetailRegistryKey: stored.pendingDetailRegistryKey ?? null,
      pendingDetailServerId: stored.pendingDetailServerId ?? null,
      pendingDetailServerName: stored.pendingDetailServerName ?? null,
      pendingManualDraft: stored.pendingManualDraft ?? false,
    });
  }, [selection, session]);

  useEffect(() => {
    const onOpenServer = (event: Event) => {
      const serverId = (event as CustomEvent<{ serverId: number }>).detail?.serverId;
      if (!serverId) {
        return;
      }
      pendingDetailRef.current = { registryKey: null, serverId, serverName: null };
      setSelection({ kind: "installed", id: serverId });
      setSession((current) => ({ ...current, installedSectionExpanded: true }));
      setDetailScrollResetSignal((value) => value + 1);
    };
    window.addEventListener(APP_OPEN_MCP_SERVER_EVENT, onOpenServer);
    return () => window.removeEventListener(APP_OPEN_MCP_SERVER_EVENT, onOpenServer);
  }, []);

  useEffect(() => {
    initRegistryWorker();
  }, []);

  useEffect(() => {
    if (session.search !== query) {
      setQuery(session.search);
    }
  }, []);

  useEffect(() => {
    setSession((current) => (current.search === query ? current : { ...current, search: query }));
  }, [query]);

  const setInstalledSectionExpanded = useCallback((expanded: boolean) => {
    setSession((current) => ({ ...current, installedSectionExpanded: expanded }));
  }, []);

  const setMarketSectionExpanded = useCallback((expanded: boolean) => {
    setSession((current) => ({ ...current, marketSectionExpanded: expanded }));
  }, []);

  const installedSectionExpanded = session.installedSectionExpanded ?? true;
  const marketSectionExpanded = session.marketSectionExpanded ?? true;

  const consumePendingDetail = useCallback(() => {
    const stored = readPageSession(MCP_PAGE_SESSION_KEY, defaultMcpPageSession());
    const registryKey = stored.pendingDetailRegistryKey?.trim() || null;
    const serverId = stored.pendingDetailServerId ?? null;
    const serverName = stored.pendingDetailServerName?.trim() || null;
    const pendingManual = stored.pendingManualDraft;

    if (!registryKey && !serverId && !serverName && !pendingManual) {
      return;
    }

    writePageSession(MCP_PAGE_SESSION_KEY, {
      ...stored,
      pendingDetailRegistryKey: null,
      pendingDetailServerId: null,
      pendingDetailServerName: null,
      pendingManualDraft: false,
    });

    if (pendingManual) {
      setCreatingManual(true);
      setCreateDraftName("");
      return;
    }

    pendingDetailRef.current = { registryKey, serverId, serverName };
    initRegistryWorker();
    if (!registryKey && !serverId && serverName) {
      registrySearch(serverName);
    }
  }, []);

  useLayoutEffect(() => {
    if (!mcpActive) {
      return;
    }
    consumePendingDetail();
  }, [consumePendingDetail, mcpActive]);

  useEffect(() => {
    const pending = pendingDetailRef.current;
    if (!pending.registryKey && !pending.serverId && !pending.serverName) {
      return;
    }

    if (pending.registryKey) {
      const cached = findRegistryEntryByRegistryKey(pending.registryKey);
      if (cached) {
        setSelection({ kind: "registry", key: entryKey(cached) });
        pendingDetailRef.current = { registryKey: null, serverId: null, serverName: null };
        return;
      }

      let cancelled = false;
      void fetchRegistryServerByKey(pending.registryKey).then((entry) => {
        if (cancelled) {
          return;
        }
        if (entry) {
          rememberRegistryEntry(entry);
          setSelection({ kind: "registry", key: entryKey(entry) });
        }
        pendingDetailRef.current = { registryKey: null, serverId: null, serverName: null };
      });
      return () => {
        cancelled = true;
      };
    }

    if (pending.serverId) {
      const installed = installedServers.find((server) => server.id === pending.serverId);
      if (installed) {
        setSelection({ kind: "installed", id: installed.id });
        pendingDetailRef.current = { registryKey: null, serverId: null, serverName: null };
      }
      return;
    }

    if (pending.serverName && !registryLoading) {
      const match = findRegistryEntryByName(pageServers, pending.serverName);
      if (match) {
        setSelection({ kind: "registry", key: entryKey(match) });
        pendingDetailRef.current = { registryKey: null, serverId: null, serverName: null };
        return;
      }
      if (pageServers.length === 0 && !hasMore) {
        pendingDetailRef.current = { registryKey: null, serverId: null, serverName: null };
      }
    }
  }, [hasMore, installedServers, pageServers, registryLoading]);

  const registryListServers = useMemo(() => {
    return pageServers.filter(
      (entry) => !findInstalledServerForEntry(entry, installedServers),
    );
  }, [installedServers, pageServers]);

  const firstMarketKey = registryListServers[0] ? entryKey(registryListServers[0]) : null;
  const searchQuery = query.trim();

  const syncEntry = useMemo(() => {
    if (!selection) {
      return null;
    }
    if (selection.kind === "registry") {
      const entry =
        pageServers.find((item) => entryKey(item) === selection.key) ??
        findRegistryEntryByRegistryKey(selection.key);
      if (entry) {
        rememberRegistryEntry(entry);
      }
      return entry ?? null;
    }
    if (selection.kind === "installed") {
      const installed = installedServers.find((server) => server.id === selection.id);
      if (!installed) {
        return null;
      }
      const entry = resolveRegistryEntryFromInstalled(installed);
      if (entry) {
        rememberRegistryEntry(entry);
      }
      return entry;
    }
    return null;
  }, [installedServers, pageServers, selection]);

  const activeEntry =
    syncEntry ?? (fetchedEntry?.token === selectionToken ? fetchedEntry.entry : null);

  const selectedInstalled = useMemo(() => {
    if (selection?.kind === "installed") {
      return installedServers.find((server) => server.id === selection.id) ?? null;
    }
    if (selection?.kind === "registry" && activeEntry) {
      return findInstalledServerForEntry(activeEntry, installedServers);
    }
    return null;
  }, [activeEntry, installedServers, selection]);

  useEffect(() => {
    if (!selection || !selectionToken || syncEntry) {
      return;
    }

    let cancelled = false;
    setFetchedEntry(null);

    void (async () => {
      let entry: McpServerEntry | null = null;
      if (selection.kind === "registry") {
        entry = await fetchRegistryServerByKey(selection.key);
      } else if (selection.kind === "installed") {
        const installed = installedServers.find((server) => server.id === selection.id);
        if (installed) {
          entry = await fetchRegistryEntryForInstalled(installed);
        }
      }

      if (cancelled) {
        return;
      }

      if (entry) {
        rememberRegistryEntry(entry);
        setFetchedEntry({ token: selectionToken, entry });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [installedServers, selection, selectionToken, syncEntry]);

  const { scrollTop } = session;

  const setScrollTop = useCallback((value: number) => {
    setSession((current) =>
      current.scrollTop === value ? current : { ...current, scrollTop: value },
    );
  }, []);

  const scrollToMarketSection = useCallback(() => {
    const scrollEl = listScrollRef.current;
    const sectionEl = marketSectionRef.current;
    if (!scrollEl || !sectionEl) {
      return;
    }
    const nextTop =
      sectionEl.getBoundingClientRect().top -
      scrollEl.getBoundingClientRect().top +
      scrollEl.scrollTop;
    scrollEl.scrollTop = Math.max(0, nextTop);
    setScrollTop(scrollEl.scrollTop);
  }, [setScrollTop]);

  useEffect(() => {
    if (!searchQuery) {
      return;
    }
    setMarketSectionExpanded(true);
  }, [searchQuery, setMarketSectionExpanded]);

  useEffect(() => {
    if (!searchQuery) {
      return;
    }

    const revealMarketResults = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToMarketSection();
          if (!firstMarketKey) {
            return;
          }
          const scrollEl = listScrollRef.current;
          const card = scrollEl?.querySelector(
            `[data-registry-entry-key="${CSS.escape(firstMarketKey)}"]`,
          );
          if (card instanceof HTMLElement) {
            clampScrollParentAndRevealAnchor(card);
            if (scrollEl) {
              setScrollTop(scrollEl.scrollTop);
            }
          }
        });
      });
    };

    if (firstMarketKey) {
      setSelection((current) =>
        current?.kind === "registry" && current.key === firstMarketKey
          ? current
          : { kind: "registry", key: firstMarketKey },
      );
      setDocsExpanded(false);
      setDetailScrollResetSignal((value) => value + 1);
    }

    if (!registryLoading || firstMarketKey) {
      revealMarketResults();
    }
  }, [
    firstMarketKey,
    page,
    registryLoading,
    scrollToMarketSection,
    searchQuery,
    setScrollTop,
  ]);

  const handleMarketPageChange = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToMarketSection();
        });
      });
    },
    [scrollToMarketSection, setPage],
  );

  const resetCreateManual = useCallback(() => {
    setCreatingManual(false);
    setCreateDraftName("");
    setCreateError(null);
  }, []);

  const handleDocsExpandedChange = useCallback((expanded: boolean) => {
    setDocsScrollSignal(0);
    setDocsExpanded(expanded);
  }, []);

  const handleSelectRegistry = useCallback((entry: McpServerEntry) => {
    resetCreateManual();
    setDocsScrollSignal(0);
    setDocsExpanded(false);
    setDetailScrollResetSignal((current) => current + 1);
    setSelection({ kind: "registry", key: entryKey(entry) });
  }, [resetCreateManual]);

  const handleSelectInstalled = useCallback((server: { id: number }) => {
    resetCreateManual();
    setDocsScrollSignal(0);
    setDocsExpanded(false);
    setDetailScrollResetSignal((current) => current + 1);
    setSelection({ kind: "installed", id: server.id });
  }, [resetCreateManual]);

  const handleReadMoreConnectionError = useCallback((server: InstalledMcpServer) => {
    const registryEntry = resolveRegistryEntryFromInstalled(server);
    if (!registryEntry) {
      resetCreateManual();
      setDocsScrollSignal(0);
      setDocsExpanded(false);
      setSelection({ kind: "installed", id: server.id });
      return;
    }

    resetCreateManual();
    setInstalledSectionExpanded(true);
    setDocsScrollSignal((current) => current + 1);

    const alreadySelected =
      selection?.kind === "installed" && selection.id === server.id;
    if (alreadySelected) {
      setDocsExpanded(true);
      return;
    }

    setDocsExpanded(true);
    setSelection({ kind: "installed", id: server.id });
  }, [resetCreateManual, selection, setInstalledSectionExpanded]);

  const handleAddManual = () => {
    setCreateError(null);
    setCreatingManual(true);
    setCreateDraftName("");
    setSelection(null);
  };

  const handleCommitCreateManual = useCallback(async () => {
    const trimmed = createDraftName.trim();
    if (!trimmed) {
      return;
    }

    setCreateError(null);
    try {
      const draft = createManualMcpDraft();
      const saved = await addInstalledMcpServer({ ...draft, name: trimmed });
      resetCreateManual();
      enableMcpAuthPrompt(saved.id);
      await refresh({ silent: true });
      setSelection({ kind: "installed", id: saved.id });
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [createDraftName, refresh, resetCreateManual]);

  const handleServerDeleted = useCallback((serverId: number) => {
    setSelection((current) =>
      current?.kind === "installed" && current.id === serverId ? null : current,
    );
  }, []);

  const handleServerInstalled = useCallback(
    (installed: InstalledMcpServer) => {
      enableMcpAuthPrompt(installed.id);
      void refresh({ silent: true }).then(() => {
        resetCreateManual();
        setSelection({ kind: "installed", id: installed.id });
      });
    },
    [refresh, resetCreateManual],
  );

  const handleListRefresh = useCallback(
    (server: InstalledMcpServer) => {
      if (server.id <= 0) {
        return;
      }
      enableMcpAuthPrompt(server.id);
      setRefreshingListId(server.id);
      void refreshMcpTools(server.id)
        .then((snapshot) => {
          setCachedMcpToolsSnapshot(server.id, snapshot ?? null);
          refreshConnectionStatus(server, { force: true });
        })
        .finally(() => {
          setRefreshingListId((current) => (current === server.id ? null : current));
        });
    },
    [refreshConnectionStatus],
  );

  const handleListSignIn = useCallback(
    (server: InstalledMcpServer) => {
      handleSelectInstalled(server);
      enableMcpAuthPrompt(server.id);
      void startMcpOAuthSignIn(server.id).catch(() => undefined);
    },
    [handleSelectInstalled],
  );

  const handleListDelete = useCallback(
    (server: { id: number }) => {
      if (server.id <= 0) {
        return;
      }
      void removeInstalledMcpServer(server.id)
        .then(() => {
          handleServerDeleted(server.id);
          return refresh({ silent: true });
        })
        .catch(() => undefined);
    },
    [handleServerDeleted, refresh],
  );

  const pageItemCount = pageServers.length;
  const pageStart = pageItemCount === 0 ? 0 : page * MARKET_PAGE_SIZE + 1;
  const pageEnd = pageItemCount === 0 ? 0 : page * MARKET_PAGE_SIZE + pageItemCount;
  const paginationTotal = hasMore ? Math.max(totalFiltered, pageEnd) : totalFiltered;
  const showRegistryLoading = registryLoading && pageItemCount === 0;
  const showRegistryOverlay = registryLoading && pageItemCount > 0 && isCachePreview;
  const showInstalledSection = installedServers.length > 0;

  if (installedLoading) {
    return (
      <YStack flex={1} justify="center" items="center" px={12}>
        <InlineLoader label="Loading MCP servers…" />
      </YStack>
    );
  }

  if (installedError) {
    return (
      <YStack flex={1} justify="center" items="center" px={12}>
        <Text color={colors.error} fontSize={14} text="center">
          {installedError}
        </Text>
      </YStack>
    );
  }

  return (
    <InstalledMcpPathsProvider installedPaths={installedPaths}>
      <YStack flex={1} minH={0} overflow="hidden" {...pageContentInsets}>
        <XStack flex={1} minH={0} minW={0} gap={8}>
          <McpPanel
            width={LIST_WIDTH}
            shrink={0}
            minH={0}
            p={0}
            overflow="hidden"
          >
            <ScrollFadePanel
              scrollRef={listScrollRef}
              initialScrollTop={scrollTop}
              onScrollTopChange={setScrollTop}
              contentPadding="8px"
              contentGap={8}
              headerPaddingBottom={6}
              header={
                  <XStack width="100%" gap={8} items="center">
                    <McpInlineSearch
                      flex={1}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search servers"
                    />
                    <ToolbarIconButton
                      onClick={handleAddManual}
                      disabled={creatingManual}
                      aria-label="Add server manually"
                    >
                      <IoAdd size={20} />
                    </ToolbarIconButton>
                  </XStack>
                }
            >
              <YStack gap={8} pb={4}>
                {creatingManual ? (
                  <McpCreateRow
                    name={createDraftName}
                    onNameChange={setCreateDraftName}
                    onCancel={resetCreateManual}
                    onCommit={() => {
                      void handleCommitCreateManual();
                    }}
                  />
                ) : null}

                {createError ? (
                  <Text color={colors.error} fontSize={12} px={2} select="none">
                    {createError}
                  </Text>
                ) : null}

                {showInstalledSection ? (
                  <McpListCollapsibleSection
                    title="Installed"
                    count={installedServers.length}
                    expanded={installedSectionExpanded}
                    onExpandedChange={setInstalledSectionExpanded}
                  >
                    {installedServers.map((server) => {
                      const registryEntry = resolveRegistryEntryFromInstalled(server);
                      if (registryEntry) {
                        rememberRegistryEntry(registryEntry);
                        linkInstalledToRegistry(server.id, entryKey(registryEntry));
                      }
                      const description = resolveInstalledListDescription(
                        server.id,
                        registryEntry,
                      );
                      return (
                        <McpInstalledListCard
                          key={`installed-${server.id}`}
                          server={server}
                          registryEntry={registryEntry}
                          connectionStatus={connectionStatuses[server.id]}
                          description={description}
                          selected={
                            selection?.kind === "installed" && selection.id === server.id
                          }
                          onSelect={handleSelectInstalled}
                          onRefresh={handleListRefresh}
                          onDelete={handleListDelete}
                          onSignIn={handleListSignIn}
                          onReadMore={
                            registryEntry ? handleReadMoreConnectionError : undefined
                          }
                          refreshing={refreshingListId === server.id}
                        />
                      );
                    })}
                  </McpListCollapsibleSection>
                ) : null}

                <McpListCollapsibleSection
                  title="Market"
                  count={paginationTotal}
                  expanded={marketSectionExpanded}
                  onExpandedChange={setMarketSectionExpanded}
                  sectionRef={marketSectionRef}
                >
                  {showRegistryLoading && registryListServers.length === 0 ? (
                    <InlineLoader label="Loading servers…" minHeight={80} />
                  ) : null}

                  {registryError ? (
                    <YStack gap={8} px={2}>
                      <Text color={colors.error} fontSize={13}>
                        {registryError}
                      </Text>
                      <Button
                        unstyled
                        self="flex-start"
                        px={12}
                        py={8}
                        rounded={8}
                        bg={surfaces.card}
                        onPress={refreshRegistry}
                      >
                        <Text color={colors.foreground} fontSize={13}>
                          Retry
                        </Text>
                      </Button>
                    </YStack>
                  ) : null}

                  {showRegistryOverlay ? (
                    <InlineLoader label="Loading servers…" minHeight={40} />
                  ) : null}

                  {registryListServers.map((entry) => (
                    <McpServerListCard
                      key={entryKey(entry)}
                      entry={entry}
                      selected={
                        selection?.kind === "registry" && selection.key === entryKey(entry)
                      }
                      onSelect={handleSelectRegistry}
                      onInstalled={handleServerInstalled}
                    />
                  ))}

                  {!registryLoading && registryListServers.length === 0 ? (
                    <Text color={colors.muted} fontSize={13} text="center" py={12} select="none">
                      No servers match your search.
                    </Text>
                  ) : null}

                  {paginationTotal > 0 || pageItemCount > 0 ? (
                    <ListPaginationFooter
                      pageStart={pageStart}
                      pageEnd={pageEnd}
                      total={paginationTotal}
                      page={page}
                      pageCount={pageCount}
                    hasMore={hasMore}
                    onPageChange={handleMarketPageChange}
                  />
                  ) : null}
                </McpListCollapsibleSection>
              </YStack>
            </ScrollFadePanel>
          </McpPanel>

          <McpPanel flex={1} minH={0} minW={0} p={0} overflow="hidden">
            <McpDetailPanel
                selectionToken={selectionToken}
                entry={activeEntry}
                installedServer={selectedInstalled}
                docsExpanded={docsExpanded}
                onDocsExpandedChange={handleDocsExpandedChange}
                docsScrollSignal={docsScrollSignal}
                detailScrollResetSignal={detailScrollResetSignal}
                onUpdated={() => {
                  void refresh({ silent: true });
                  if (selectedInstalled) {
                    refreshConnectionStatus(selectedInstalled);
                  }
                }}
                onDeleted={handleServerDeleted}
                onInstalled={handleServerInstalled}
              />
          </McpPanel>
        </XStack>
      </YStack>
    </InstalledMcpPathsProvider>
  );
}
