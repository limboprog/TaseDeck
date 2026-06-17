import { agentLabelFromCatalog, getAgentCatalogSync } from "../catalog/agentCatalog";
import type { AgentKind } from "./types";

export function getAgentOptions() {
  return getAgentCatalogSync().map((entry) => ({
    kind: entry.kind as AgentKind,
    label: entry.label,
  }));
}

export function agentLabel(kind: AgentKind) {
  return agentLabelFromCatalog(kind);
}
