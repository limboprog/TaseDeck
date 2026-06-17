import {
  agentLabelFromCatalog,
  catalogEntryForKind as catalogEntryForKindFromStore,
  catalogEntryForLabel as catalogEntryForLabelFromStore,
  getAgentCatalogSync,
} from "../catalog/agentCatalog";
import type { AgentCatalogEntry, AgentKind } from "./types";

/** @deprecated Prefer `getAgentCatalogSync()` / `useAgentCatalog()` from catalog service. */
export function getAgentCatalog(): AgentCatalogEntry[] {
  return getAgentCatalogSync();
}

export function agentLabel(kind: AgentKind) {
  return agentLabelFromCatalog(kind);
}

export function catalogEntryForLabel(label: string): AgentCatalogEntry | undefined {
  return catalogEntryForLabelFromStore(label);
}

export function catalogEntryForKind(kind: AgentKind): AgentCatalogEntry | undefined {
  return catalogEntryForKindFromStore(kind);
}
