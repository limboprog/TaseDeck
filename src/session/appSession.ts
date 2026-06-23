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
  scrollTop: number;
  pendingManualDraft?: boolean;
  pendingDetailRegistryKey?: string | null;
  pendingDetailServerId?: number | null;
  pendingDetailServerName?: string | null;
  selectedRegistryKey?: string | null;
  selectedInstalledId?: number | null;
  descriptionExpanded?: boolean;
  installedSectionExpanded?: boolean;
  marketSectionExpanded?: boolean;
};

export type AgentsPageSession = {
  search: string;
  scrollTop: number;
  selectedAgentId: number | null;
  agentsNavExpanded: boolean;
};

export const defaultMcpPageSession = (): McpPageSession => ({
  search: "",
  scrollTop: 0,
  pendingDetailRegistryKey: null,
  pendingDetailServerId: null,
  pendingDetailServerName: null,
  selectedRegistryKey: null,
  selectedInstalledId: null,
  descriptionExpanded: false,
  installedSectionExpanded: true,
  marketSectionExpanded: true,
});

export const defaultAgentsPageSession = (): AgentsPageSession => ({
  search: "",
  scrollTop: 0,
  selectedAgentId: null,
  agentsNavExpanded: true,
});

export type ProjectDetailUiSession = {
  scrollTop?: number;
  expandedServerKeys?: string[];
  addAgentExpanded?: boolean;
};

export type ProjectsPageSession = {
  selectedProjectId: string | null;
  projectsNavExpanded: boolean;
  projectDetailsById?: Record<string, ProjectDetailUiSession>;
};

export const PROJECTS_PAGE_SESSION_KEY = "projects";

export const defaultProjectsPageSession = (): ProjectsPageSession => ({
  selectedProjectId: null,
  projectsNavExpanded: true,
  projectDetailsById: {},
});

export function readProjectDetailUiSession(
  projectId: string,
): ProjectDetailUiSession {
  const page = readPageSession(PROJECTS_PAGE_SESSION_KEY, defaultProjectsPageSession());
  return page.projectDetailsById?.[projectId] ?? {};
}

export function writeProjectDetailUiSession(
  projectId: string,
  patch: ProjectDetailUiSession,
) {
  const page = readPageSession(PROJECTS_PAGE_SESSION_KEY, defaultProjectsPageSession());
  const prev = page.projectDetailsById?.[projectId] ?? {};
  writePageSession(PROJECTS_PAGE_SESSION_KEY, {
    ...page,
    projectDetailsById: {
      ...(page.projectDetailsById ?? {}),
      [projectId]: { ...prev, ...patch },
    },
  });
}

export type WorkspacePageSession = {
  selectedTopologyId: string | null;
};

export const defaultWorkspacePageSession = (): WorkspacePageSession => ({
  selectedTopologyId: null,
});

export type PresetsPageSession = {
  expandedPresetIds: string[];
};

export const defaultPresetsPageSession = (): PresetsPageSession => ({
  expandedPresetIds: [],
});

export const PRESETS_PAGE_SESSION_KEY = "presets";

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
