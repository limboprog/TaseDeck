/// <reference lib="webworker" />

import { filterByConnection } from "./filters";
import {
  filterAndSortEntries,
  mergeUniqueEntries,
  normalizeSearch,
} from "./searchCore";
import type { McpListResult, McpServerEntry, McpSourceId } from "./types";

const CATALOG_SOURCE: McpSourceId = "all";
const PAGE_SIZE = 60;
const SEARCH_DEBOUNCE_MS = 200;
const FIRST_CHAR_DEBOUNCE_MS = 60;
const PAGE_WINDOW_RADIUS = 1;

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

function getAncestorEntries(search: string): McpServerEntry[] | null {
  const normalized = normalizeSearch(search);
  if (!normalized) {
    return null;
  }

  const exact = getCatalogSession(search);
  if (exact) {
    return exact.servers;
  }

  for (let length = normalized.length - 1; length >= 1; length -= 1) {
    const ancestor = normalized.slice(0, length);
    const session = sessions.get(sessionKey(CATALOG_SOURCE, ancestor));
    if (session?.servers.length) {
      return session.servers;
    }
  }

  return null;
}

function shouldUseCachedSession(session: SearchSession | undefined) {
  if (!session?.loaded) {
    return false;
  }
  if (session.servers.length > 0) {
    return true;
  }
  return !session.hasMore;
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
  const session: SearchSession = {
    search: normalized,
    servers: normalized
      ? filterAndSortEntries(serversList, search)
      : [...serversList],
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
  const existing = getCatalogSession(search);
  const merged = mergeUniqueEntries(existing?.servers ?? [], incoming);
  return replacePage(search, merged, nextCursor);
}

function clearCatalogSearch(search: string) {
  sessions.delete(sessionKey(CATALOG_SOURCE, search));
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
  for (let offset = -PAGE_WINDOW_RADIUS; offset <= PAGE_WINDOW_RADIUS; offset += 1) {
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
  const exact = getCatalogSession(query);

  if (!normalized) {
    if (exact) {
      return {
        servers: applySourceFilter(exact.servers, source),
        hasMore: exact.hasMore,
        isCachePreview: false,
        session: exact,
      };
    }

    return {
      servers: [],
      hasMore: false,
      isCachePreview: false,
    };
  }

  if (exact) {
    return {
      servers: applySourceFilter(exact.servers, source),
      hasMore: exact.hasMore,
      isCachePreview: false,
      session: exact,
    };
  }

  const ancestorEntries = getAncestorEntries(query);
  if (!ancestorEntries) {
    return {
      servers: [],
      hasMore: false,
      isCachePreview: false,
    };
  }

  const filtered = filterAndSortEntries(ancestorEntries, query);
  const ancestorSession = getCatalogSession(query);

  return {
    servers: applySourceFilter(filtered, source),
    hasMore: Boolean(ancestorSession?.hasMore),
    isCachePreview: filtered.length > 0,
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
    await fetchFromNetwork(searchId, currentQuery, "append");
    view = buildView(currentQuery, currentSource);
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

  if (pageNeedsMoreData(currentPage, view)) {
    emitState(searchId, { loading: currentSlice.length === 0, error: null });
    const needCount = (currentPage + 1) * PAGE_SIZE;
    view = await ensureFilteredCount(searchId, needCount);
    if (searchId !== latestSearchId) {
      return;
    }
  }

  emitState(searchId, { loading: false });
}

async function prefetchAdjacentPages(searchId: number) {
  if (searchId !== latestSearchId) {
    return;
  }

  const nextPage = currentPage + PAGE_WINDOW_RADIUS;
  const needCount = (nextPage + 1) * PAGE_SIZE;
  let view = await ensureFilteredCount(searchId, needCount);

  if (searchId !== latestSearchId) {
    return;
  }

  const cache = ensurePageWindowCache(currentQuery, currentSource);
  if (nextPage >= 0) {
    getPageSlice(view, nextPage, cache);
  }

  const prevPage = currentPage - PAGE_WINDOW_RADIUS;
  if (prevPage >= 0) {
    view = buildView(currentQuery, currentSource);
    getPageSlice(view, prevPage, cache);
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
      await fetchFromNetwork(searchId, currentQuery, "reset");
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
) {
  if (searchId !== latestSearchId) {
    return;
  }

  await waitUntilNetworkIdle();

  if (searchId !== latestSearchId || networkBusy) {
    return;
  }

  networkBusy = true;

  if (mode === "reset") {
    emitState(searchId, { loading: true, error: null });
  }

  try {
    const existing = getCatalogSession(query);

    const result = await requestCatalogPage({
      search: query,
      source: CATALOG_SOURCE,
      cursor: mode === "append" ? existing?.nextCursor : undefined,
      limit: PAGE_SIZE,
    });

    if (searchId !== latestSearchId) {
      return;
    }

    const session =
      mode === "append"
        ? appendPage(query, result.servers, result.nextCursor)
        : replacePage(query, result.servers, result.nextCursor);

    resetPageWindowCache();

    emitState(
      searchId,
      {
        loading: false,
        isCachePreview: false,
        error: null,
      },
      { source: CATALOG_SOURCE, search: query, session },
    );
  } catch (err) {
    if (searchId !== latestSearchId) {
      return;
    }

    const message =
      err instanceof Error ? err.message : "Failed to load MCP servers";

    emitState(searchId, {
      loading: false,
      error: message,
    });
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
  const exactSession = getCatalogSession(query);
  const canServeFromCache = Boolean(
    exactSession && shouldUseCachedSession(exactSession),
  );
  const needsFetch =
    !canServeFromCache ||
    pageNeedsMoreData(0, view) ||
    (view.servers.length === 0 && Boolean(exactSession?.hasMore));

  emitState(searchId, {
    isCachePreview: view.isCachePreview,
    loading: view.servers.length === 0 && needsFetch,
    error: null,
  });

  if (canServeFromCache && !needsFetch) {
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
      resetPageWindowCache();
      handleSearch(message.searchId, message.query, message.source);
      break;
    }
    default:
      break;
  }
};
