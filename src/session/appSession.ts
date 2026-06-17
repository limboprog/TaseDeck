const PREFIX = "tasedeck:session:";

export function readPageSession<T>(key: string, fallback: T): T {
  if (typeof sessionStorage === "undefined") {
    return fallback;
  }
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writePageSession<T>(key: string, value: T) {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export type McpPageSession = {
  search: string;
  expandedServerIds: number[];
  scrollTop: number;
  pendingManualDraft?: boolean;
};

export type AgentsPageSession = {
  search: string;
  scrollTop: number;
};

export const defaultMcpPageSession = (): McpPageSession => ({
  search: "",
  expandedServerIds: [],
  scrollTop: 0,
});

export const defaultAgentsPageSession = (): AgentsPageSession => ({
  search: "",
  scrollTop: 0,
});

export type WorkspacePageSession = {
  selectedTopologyId: string | null;
};

export const defaultWorkspacePageSession = (): WorkspacePageSession => ({
  selectedTopologyId: null,
});

export const MARKET_PAGE_SESSION_KEY = "mcp-market";

export type MarketPageSession = {
  pendingDetailRegistryKey: string | null;
  /** Resolve legacy installs via installed server record. */
  pendingDetailServerId: number | null;
  /** Last-resort name search when no registry key or server id. */
  pendingDetailServerName: string | null;
};

export const defaultMarketPageSession = (): MarketPageSession => ({
  pendingDetailRegistryKey: null,
  pendingDetailServerId: null,
  pendingDetailServerName: null,
});
