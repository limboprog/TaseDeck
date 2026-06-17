import { useEffect, useSyncExternalStore } from "react";
import { registrySearchCache } from "./cache";
import { fetchCatalogPage } from "./registryFetch";
import type {
  RegistryWorkerIn,
  RegistryWorkerOut,
  RegistryWorkerState,
} from "./registry.worker";
import RegistryWorker from "./registry.worker?worker";
import { MCP_SOURCE_ORDER } from "./sources";
import { getMcpRegistryUiState, patchMcpRegistryUiState } from "./store";
import type { McpSourceId } from "./types";

const DEFAULT_STATE: RegistryWorkerState = {
  query: "",
  source: "all",
  page: 0,
  pageCount: 1,
  pageServers: [],
  totalFiltered: 0,
  hasMore: false,
  loading: true,
  isCachePreview: false,
  error: null,
};

let snapshot: RegistryWorkerState = { ...DEFAULT_STATE };
let searchGeneration = 0;
let worker: Worker | undefined;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeRegistry(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRegistrySnapshot(): RegistryWorkerState {
  return snapshot;
}

async function handleWorkerMessage(event: MessageEvent<RegistryWorkerOut>) {
  const message = event.data;

  if (message.type === "FETCH_REQUEST") {
    try {
      const result = await fetchCatalogPage(message.params);
      worker?.postMessage({
        type: "FETCH_RESPONSE",
        requestId: message.requestId,
        result,
      });
    } catch (err) {
      worker?.postMessage({
        type: "FETCH_RESPONSE",
        requestId: message.requestId,
        error: err instanceof Error ? err.message : "Failed to load MCP servers",
      });
    }
    return;
  }

  if (message.type !== "STATE") {
    return;
  }

  if (message.searchId !== searchGeneration) {
    return;
  }

  snapshot = message.state;
  patchMcpRegistryUiState({
    query: snapshot.query,
    source: snapshot.source,
  });

  if (message.sessionUpdate) {
    registrySearchCache.importSession(
      message.sessionUpdate.source,
      message.sessionUpdate.search,
      message.sessionUpdate.session,
    );
  }

  emit();
}

function ensureWorker() {
  if (started) {
    return;
  }

  started = true;
  worker = new RegistryWorker();
  worker.onmessage = handleWorkerMessage;

  const saved = getMcpRegistryUiState();
  const sessions = registrySearchCache.exportAllSessions();

  snapshot = {
    ...snapshot,
    query: saved.query,
    source: saved.source,
  };

  const hydrateMessage: RegistryWorkerIn = {
    type: "HYDRATE",
    sessions,
  };
  worker.postMessage(hydrateMessage);

  searchGeneration += 1;
  const searchMessage: RegistryWorkerIn = {
    type: "SEARCH",
    searchId: searchGeneration,
    query: saved.query,
    source: saved.source,
  };
  worker.postMessage(searchMessage);
}

function postToWorker(message: RegistryWorkerIn) {
  ensureWorker();
  worker?.postMessage(message);
}

export function registrySearch(query: string, source?: McpSourceId) {
  const nextSource = source ?? snapshot.source;
  const sourceChanged = source !== undefined && source !== snapshot.source;
  searchGeneration += 1;
  const queryChanged = query !== snapshot.query;

  snapshot = {
    ...snapshot,
    query,
    source: nextSource,
    page: 0,
  };
  patchMcpRegistryUiState({ query, source: nextSource });

  if (sourceChanged || queryChanged) {
    emit();
  }

  postToWorker({
    type: "SEARCH",
    searchId: searchGeneration,
    query,
    source: nextSource,
  });
}

export function registrySetPage(page: number) {
  snapshot = {
    ...snapshot,
    page,
  };
  emit();

  postToWorker({
    type: "SET_PAGE",
    searchId: searchGeneration,
    query: snapshot.query,
    source: snapshot.source,
    page,
  });
}

export function registryRefresh() {
  registrySearchCache.clearCatalogSearch(snapshot.query);
  searchGeneration += 1;
  postToWorker({
    type: "REFRESH",
    searchId: searchGeneration,
    query: snapshot.query,
    source: snapshot.source,
  });
}

export function initRegistryWorker() {
  ensureWorker();
}

export function useMcpRegistry() {
  useEffect(() => {
    initRegistryWorker();
  }, []);

  const state = useSyncExternalStore(
    subscribeRegistry,
    getRegistrySnapshot,
    getRegistrySnapshot,
  );

  return {
    source: state.source,
    setSource: (source: McpSourceId) => registrySearch(state.query, source),
    query: state.query,
    setQuery: registrySearch,
    page: state.page,
    pageCount: state.pageCount,
    pageServers: state.pageServers,
    totalFiltered: state.totalFiltered,
    setPage: registrySetPage,
    loading: state.loading,
    isCachePreview: state.isCachePreview,
    error: state.error,
    hasMore: state.hasMore,
    refresh: registryRefresh,
    sourceOptions: MCP_SOURCE_ORDER,
  };
}

export { subscribeRegistry };
