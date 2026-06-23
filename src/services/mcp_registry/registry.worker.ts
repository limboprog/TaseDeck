/// <reference lib="webworker" />

import { filterByConnection } from "./filters";
import {
  filterAndSortEntries,
  mergeUniqueEntries,
  normalizeSearch,
} from "./searchCore";
import {
  MARKET_FETCH_BATCH_MAX,
  MARKET_PAGE_SIZE,
  MARKET_PREFETCH_AHEAD_PAGES,
  MARKET_PREFETCH_BEHIND_PAGES,
} from "./registryConstants";
import type { McpListResult, McpServerEntry, McpSourceId } from "./types";

const CATALOG_SOURCE: McpSourceId = "all";
const BROWSE_SESSION_KEY = `${CATALOG_SOURCE}:__browse__`;
const PAGE_SIZE = MARKET_PAGE_SIZE;
const SEARCH_DEBOUNCE_MS = 200;
const FIRST_CHAR_DEBOUNCE_MS = 60;

export type SearchSession = {
  search: string;
  servers: McpServerEntry[];
  nextCursor?: string;
  hasMore: boolean;
  loaded?: boolean;
};

type PageWindowCache = {
  query: string;
  source: McpSourceId;
  pages: Map<number, McpServerEntry[]>;
};

export type RegistryWorkerState = {
  query: string;
  source: McpSourceId;
  page: number;
  pageCount: number;
  pageServers: McpServerEntry[];
  totalFiltered: number;
  hasMore: boolean;
  loading: boolean;
  isCachePreview: boolean;
  error: string | null;
};

export type RegistryWorkerIn =
  | {
      type: "HYDRATE";
      sessions: Array<{ key: string; session: SearchSession }>;
    }
  | {
      type: "SEARCH";
      searchId: number;
      query: string;
      source: McpSourceId;
    }
  | {
      type: "SET_PAGE";
      searchId: number;
      query: string;
      source: McpSourceId;
      page: number;
    }
  | {
      type: "REFRESH";
      searchId: number;
      query: string;
      source: McpSourceId;
    };

export type RegistryFetchParams = {
  search?: string;
  source: McpSourceId;
  cursor?: string;
  limit?: number;
};

export type RegistryWorkerOut =
  | {
      type: "STATE";
      searchId: number;
      state: RegistryWorkerState;
      sessionUpdate?: {
        source: McpSourceId;
        search: string;
        session: SearchSession;
      };
    }
  | {
      type: "FETCH_REQUEST";
      requestId: number;
      params: RegistryFetchParams;
    };

export type RegistryWorkerFetchIn = {
  type: "FETCH_RESPONSE";
  requestId: number;
  result?: McpListResult;
  error?: string;
};

const sessions = new Map<string, SearchSession>();
let latestSearchId = 0;
let currentQuery = "";
let currentSource: McpSourceId = "all";
let currentPage = 0;
let fetchTimer: ReturnType<typeof setTimeout> | undefined;
let networkBusy = false;
let fetchRequestId = 0;
let pageWindowCache: PageWindowCache | null = null;
const pendingFetches = new Map<
  number,
  {
    resolve: (result: McpListResult) => void;
    reject: (error: Error) => void;
  }
>();

function requestCatalogPage(params: RegistryFetchParams): Promise<McpListResult> {
  const requestId = (fetchRequestId += 1);

  return new Promise((resolve, reject) => {
    pendingFetches.set(requestId, { resolve, reject });
    const message: RegistryWorkerOut = {
      type: "FETCH_REQUEST",
      requestId,
      params,
    };
    self.postMessage(message);
  });
}

function sessionKey(source: McpSourceId, search: string) {
  return `${source}:${normalizeSearch(search)}`;
}

function getBrowseSession(): SearchSession {
  return (
    sessions.get(BROWSE_SESSION_KEY) ?? {
      search: "",
      servers: [],
      hasMore: true,
      loaded: false,
    }
  );
}

function setBrowseSession(session: SearchSession) {
  sessions.set(BROWSE_SESSION_KEY, session);
}

function clearBrowseSession() {
  sessions.delete(BROWSE_SESSION_KEY);
}

function appendBrowsePage(
  incoming: McpServerEntry[],
  nextCursor?: string,
): SearchSession {
  const existing = getBrowseSession();
  const session: SearchSession = {
    search: "",
    servers: mergeUniqueEntries(existing.servers, incoming),
    nextCursor,
    hasMore: Boolean(nextCursor),
    loaded: true,
  };
  setBrowseSession(session);
  return session;
}

function replaceBrowsePage(
  incoming: McpServerEntry[],
  nextCursor?: string,
): SearchSession {
  const session: SearchSession = {
    search: "",
    servers: [...incoming],
    nextCursor,
    hasMore: Boolean(nextCursor),
    loaded: true,
  };
  setBrowseSession(session);
  return session;
}

function getCatalogSession(search: string) {
  return sessions.get(sessionKey(CATALOG_SOURCE, search));
}

function setCatalogSession(search: string, session: SearchSession) {
  sessions.set(sessionKey(CATALOG_SOURCE, search), session);
}

function applySourceFilter(
  entries: McpServerEntry[],
  source: McpSourceId,
): McpServerEntry[] {
  return filterByConnection(entries, source);
}

function pageNeedsMoreData(page: number, view: ReturnType<typeof buildView>) {
  const pageEnd = (page + 1) * PAGE_SIZE;
  return view.servers.length < pageEnd && view.hasMore;
}

async function sleep(ms: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitUntilNetworkIdle() {
  let spins = 0;
  while (networkBusy && spins < 200) {
    await sleep(25);
    spins += 1;
  }
}

function replacePage(
  search: string,
  serversList: McpServerEntry[],
  nextCursor?: string,
): SearchSession {
  const normalized = normalizeSearch(search);
  if (!normalized) {
    return replaceBrowsePage(serversList, nextCursor);
  }

  const session: SearchSession = {
    search: normalized,
    servers: filterAndSortEntries(serversList, search),
    nextCursor,
    hasMore: Boolean(nextCursor),
    loaded: true,
  };
  setCatalogSession(search, session);
  return session;
}

function appendPage(
  search: string,
  incoming: McpServerEntry[],
  nextCursor?: string,
): SearchSession {
  const normalized = normalizeSearch(search);
  if (!normalized) {
    return appendBrowsePage(incoming, nextCursor);
  }

  const existing = getCatalogSession(search);
  const merged = mergeUniqueEntries(existing?.servers ?? [], incoming);
  const session: SearchSession = {
    search: normalized,
    servers: filterAndSortEntries(merged, search),
    nextCursor,
    hasMore: Boolean(nextCursor),
    loaded: true,
  };
  setCatalogSession(search, session);
  return session;
}

function clearCatalogSearch(search: string) {
  sessions.delete(sessionKey(CATALOG_SOURCE, search));
}

function activeSessionForQuery(query: string): SearchSession {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return getBrowseSession();
  }
  return (
    getCatalogSession(query) ?? {
      search: normalized,
      servers: [],
      hasMore: true,
      loaded: false,
    }
  );
}

function resetPageWindowCache() {
  pageWindowCache = null;
}

function ensurePageWindowCache(query: string, source: McpSourceId) {
  if (
    pageWindowCache &&
    pageWindowCache.query === query &&
    pageWindowCache.source === source
  ) {
    return pageWindowCache;
  }

  pageWindowCache = {
    query,
    source,
    pages: new Map(),
  };
  return pageWindowCache;
}

function trimPageWindowCache(centerPage: number) {
  if (!pageWindowCache) {
    return;
  }

  const keep = new Set<number>();
  for (
    let offset = -MARKET_PREFETCH_BEHIND_PAGES;
    offset <= MARKET_PREFETCH_AHEAD_PAGES;
    offset += 1
  ) {
    const page = centerPage + offset;
    if (page >= 0) {
      keep.add(page);
    }
  }

  for (const page of pageWindowCache.pages.keys()) {
    if (!keep.has(page)) {
      pageWindowCache.pages.delete(page);
    }
  }
}

function buildView(
  query: string,
  source: McpSourceId,
): {
  servers: McpServerEntry[];
  hasMore: boolean;
  isCachePreview: boolean;
  session?: SearchSession;
} {
  const normalized = normalizeSearch(query);

  if (!normalized) {
    const browse = getBrowseSession();
    if (browse.loaded || browse.servers.length > 0) {
      return {
        servers: applySourceFilter(browse.servers, source),
        hasMore: browse.hasMore,
        isCachePreview: false,
        session: browse,
      };
    }

    return {
      servers: [],
      hasMore: true,
      isCachePreview: false,
    };
  }

  const exact = getCatalogSession(query);
  if (exact && (exact.loaded || exact.servers.length > 0)) {
    return {
      servers: applySourceFilter(exact.servers, source),
      hasMore: exact.hasMore,
      isCachePreview: false,
      session: exact,
    };
  }

  return {
    servers: [],
    hasMore: true,
    isCachePreview: false,
  };
}

function getPageSlice(
  view: ReturnType<typeof buildView>,
  page: number,
  cache: PageWindowCache,
) {
  const cached = cache.pages.get(page);
  if (cached) {
    return cached;
  }

  const pageStart = page * PAGE_SIZE;
  const slice = view.servers.slice(pageStart, pageStart + PAGE_SIZE);
  cache.pages.set(page, slice);
  return slice;
}

function buildPageState(view: ReturnType<typeof buildView>) {
  const cache = ensurePageWindowCache(currentQuery, currentSource);
  const filteredCount = view.servers.length;
  const loadedPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE) || 1);
  const maxKnownPage = view.hasMore
    ? Math.max(currentPage, loadedPages - 1)
    : Math.max(0, loadedPages - 1);
  const safePage = Math.min(Math.max(0, currentPage), maxKnownPage);
  currentPage = safePage;

  trimPageWindowCache(safePage);
  const pageServers = getPageSlice(view, safePage, cache);
  const pageCount = view.hasMore
    ? Math.max(safePage + 1, loadedPages)
    : Math.max(1, loadedPages);

  return {
    page: safePage,
    pageCount,
    pageServers,
    totalFiltered: filteredCount,
    hasMore: view.hasMore,
    isCachePreview: view.isCachePreview,
  };
}

function emitState(
  searchId: number,
  patch: Partial<RegistryWorkerState>,
  sessionUpdate?: { source: McpSourceId; search: string; session: SearchSession },
) {
  const view = buildView(currentQuery, currentSource);
  const pageState = buildPageState(view);
  const message: RegistryWorkerOut = {
    type: "STATE",
    searchId,
    state: {
      query: currentQuery,
      source: currentSource,
      loading: false,
      error: null,
      ...pageState,
      ...patch,
    },
    sessionUpdate,
  };

  self.postMessage(message);
}

async function ensureFilteredCount(
  searchId: number,
  minCount: number,
): Promise<ReturnType<typeof buildView>> {
  let view = buildView(currentQuery, currentSource);
  let guard = 0;

  while (
    searchId === latestSearchId &&
    view.servers.length < minCount &&
    view.hasMore &&
    guard < 40
  ) {
    guard += 1;
    const remaining = minCount - view.servers.length;
    const batchLimit = Math.min(
      MARKET_FETCH_BATCH_MAX,
      Math.max(PAGE_SIZE, remaining),
    );
    const active = activeSessionForQuery(currentQuery);
    const mode = active.loaded && active.servers.length > 0 ? "append" : "reset";
    const prevSessionLen = active.servers.length;
    const fetched = await fetchFromNetwork(searchId, currentQuery, mode, {
      limit: batchLimit,
    });
    if (!fetched) {
      break;
    }

    const nextSessionLen = activeSessionForQuery(currentQuery).servers.length;
    view = buildView(currentQuery, currentSource);
    if (nextSessionLen === prevSessionLen && view.hasMore) {
      const normalized = normalizeSearch(currentQuery);
      if (normalized) {
        const session = getCatalogSession(currentQuery);
        if (session) {
          setCatalogSession(currentQuery, { ...session, hasMore: false });
        }
      } else {
        const browse = getBrowseSession();
        setBrowseSession({ ...browse, hasMore: false });
      }
      view = buildView(currentQuery, currentSource);
      break;
    }
  }

  return view;
}

async function warmPageWindow(searchId: number, page: number) {
  if (searchId !== latestSearchId) {
    return;
  }

  currentPage = Math.max(0, page);
  const cache = ensurePageWindowCache(currentQuery, currentSource);
  let view = buildView(currentQuery, currentSource);
  const currentSlice = getPageSlice(view, currentPage, cache);
  const showLoading = pageNeedsMoreData(currentPage, view) && currentSlice.length === 0;

  if (showLoading) {
    emitState(searchId, { loading: true, error: null });
  }

  try {
    if (pageNeedsMoreData(currentPage, view)) {
      const needCount = (currentPage + 1) * PAGE_SIZE;
      view = await ensureFilteredCount(searchId, needCount);
    }
  } catch {
    if (searchId === latestSearchId) {
      emitState(searchId, { loading: false });
    }
    return;
  }

  if (searchId === latestSearchId) {
    emitState(searchId, { loading: false });
  }
}

async function prefetchAdjacentPages(searchId: number) {
  if (searchId !== latestSearchId) {
    return;
  }

  const maxAheadPage = currentPage + MARKET_PREFETCH_AHEAD_PAGES;
  const needCount = (maxAheadPage + 1) * PAGE_SIZE;
  let view = await ensureFilteredCount(searchId, needCount);

  if (searchId !== latestSearchId) {
    return;
  }

  const cache = ensurePageWindowCache(currentQuery, currentSource);
  for (let page = currentPage + 1; page <= maxAheadPage; page += 1) {
    getPageSlice(view, page, cache);
  }

  for (let page = currentPage - MARKET_PREFETCH_BEHIND_PAGES; page < currentPage; page += 1) {
    if (page >= 0) {
      view = buildView(currentQuery, currentSource);
      getPageSlice(view, page, cache);
    }
  }
}

function scheduleFetch(searchId: number) {
  if (fetchTimer) {
    clearTimeout(fetchTimer);
    fetchTimer = undefined;
  }

  const normalized = normalizeSearch(currentQuery);
  const delay = normalized.length <= 1 ? FIRST_CHAR_DEBOUNCE_MS : SEARCH_DEBOUNCE_MS;

  fetchTimer = setTimeout(() => {
    fetchTimer = undefined;
    void (async () => {
      const active = activeSessionForQuery(currentQuery);
      const mode = active.loaded && active.servers.length > 0 ? "append" : "reset";
      await fetchFromNetwork(searchId, currentQuery, mode);
      if (searchId !== latestSearchId) {
        return;
      }
      void prefetchAdjacentPages(searchId);
    })();
  }, normalized ? delay : 0);
}

async function fetchFromNetwork(
  searchId: number,
  query: string,
  mode: "reset" | "append",
  options?: { limit?: number },
): Promise<boolean> {
  if (searchId !== latestSearchId) {
    return false;
  }

  await waitUntilNetworkIdle();

  if (searchId !== latestSearchId) {
    return false;
  }

  while (networkBusy) {
    await sleep(25);
    if (searchId !== latestSearchId) {
      return false;
    }
  }

  networkBusy = true;
  const showLoading = mode === "reset";

  if (showLoading) {
    emitState(searchId, { loading: true, error: null });
  }

  try {
    const normalized = normalizeSearch(query);
    if (mode === "reset") {
      if (normalized) {
        clearCatalogSearch(query);
      } else {
        clearBrowseSession();
      }
    }

    const active = activeSessionForQuery(query);
    const result = await requestCatalogPage({
      source: CATALOG_SOURCE,
      cursor: mode === "append" ? active.nextCursor : undefined,
      limit: options?.limit ?? PAGE_SIZE,
      search: normalized || undefined,
    });

    if (searchId !== latestSearchId) {
      return false;
    }

    const session =
      mode === "append"
        ? appendPage(query, result.servers, result.nextCursor)
        : replacePage(query, result.servers, result.nextCursor);

    if (mode === "reset") {
      resetPageWindowCache();
    } else if (pageWindowCache) {
      pageWindowCache.pages.clear();
    }

    emitState(
      searchId,
      {
        loading: false,
        isCachePreview: false,
        error: null,
      },
      { source: CATALOG_SOURCE, search: query, session },
    );
    return true;
  } catch (err) {
    if (searchId !== latestSearchId) {
      return false;
    }

    const message =
      err instanceof Error ? err.message : "Failed to load MCP servers";

    emitState(searchId, {
      loading: false,
      error: message,
    });
    return false;
  } finally {
    networkBusy = false;
  }
}

function handleSearch(searchId: number, query: string, source: McpSourceId) {
  latestSearchId = searchId;
  currentQuery = query;
  currentSource = source;
  currentPage = 0;
  resetPageWindowCache();

  if (fetchTimer) {
    clearTimeout(fetchTimer);
    fetchTimer = undefined;
  }

  const view = buildView(query, source);
  const active = activeSessionForQuery(query);
  const needsFetch =
    !active.loaded ||
    (active.hasMore && active.servers.length < PAGE_SIZE);

  emitState(searchId, {
    isCachePreview: view.isCachePreview,
    loading: needsFetch && view.servers.length === 0,
    error: null,
  });

  if (active.loaded && !needsFetch) {
    void (async () => {
      await warmPageWindow(searchId, 0);
      void prefetchAdjacentPages(searchId);
    })();
    return;
  }

  scheduleFetch(searchId);
}

async function goToPage(searchId: number, page: number) {
  if (searchId !== latestSearchId) {
    return;
  }

  await warmPageWindow(searchId, page);
  void prefetchAdjacentPages(searchId);
}

self.onmessage = (event: MessageEvent<RegistryWorkerIn | RegistryWorkerFetchIn>) => {
  const message = event.data;

  if (message.type === "FETCH_RESPONSE") {
    const pending = pendingFetches.get(message.requestId);
    if (!pending) {
      return;
    }

    pendingFetches.delete(message.requestId);

    if (message.error) {
      pending.reject(new Error(message.error));
      return;
    }

    if (!message.result) {
      pending.reject(new Error("Registry fetch returned no data"));
      return;
    }

    pending.resolve(message.result);
    return;
  }

  switch (message.type) {
    case "HYDRATE": {
      for (const item of message.sessions) {
        sessions.set(item.key, item.session);
      }
      break;
    }
    case "SEARCH": {
      handleSearch(message.searchId, message.query, message.source);
      break;
    }
    case "SET_PAGE": {
      if (message.searchId !== latestSearchId) {
        return;
      }
      currentQuery = message.query;
      currentSource = message.source;
      void goToPage(message.searchId, message.page);
      break;
    }
    case "REFRESH": {
      clearCatalogSearch(message.query);
      clearBrowseSession();
      resetPageWindowCache();
      handleSearch(message.searchId, message.query, message.source);
      break;
    }
    default:
      break;
  }
};
