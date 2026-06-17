import { listAgentCatalog } from "../agents/api";
import type { AgentCatalogEntry } from "../agents/types";

let cached: AgentCatalogEntry[] | null = null;
let loadPromise: Promise<AgentCatalogEntry[]> | null = null;

export function getAgentCatalogSync(): AgentCatalogEntry[] {
  return cached ?? [];
}

export function loadAgentCatalog(force = false): Promise<AgentCatalogEntry[]> {
  if (!force && cached) {
    return Promise.resolve(cached);
  }
  if (!force && loadPromise) {
    return loadPromise;
  }

  loadPromise = listAgentCatalog()
    .then((entries) => {
      cached = entries;
      return entries;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function agentLabelFromCatalog(kind: string, catalog = getAgentCatalogSync()): string {
  return catalog.find((entry) => entry.kind === kind)?.label ?? kind;
}

export function catalogEntryForKind(
  kind: string,
  catalog = getAgentCatalogSync(),
): AgentCatalogEntry | undefined {
  return catalog.find((entry) => entry.kind === kind);
}

export function catalogEntryForLabel(
  label: string,
  catalog = getAgentCatalogSync(),
): AgentCatalogEntry | undefined {
  const normalized = label.trim().toLowerCase();
  return catalog.find(
    (entry) =>
      entry.label.toLowerCase() === normalized || entry.kind.toLowerCase() === normalized,
  );
}
