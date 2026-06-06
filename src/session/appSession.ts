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
