import type { AgentCatalogEntry, AgentKind } from "./types";

/** Built-in agents available in the name picker. */
export const AGENT_CATALOG: AgentCatalogEntry[] = [
  { kind: "cursor", label: "Cursor" },
  { kind: "claude-code", label: "Claude Code" },
  { kind: "antigravity", label: "Antigravity" },
  { kind: "copilot", label: "Copilot" },
];

export function agentLabel(kind: AgentKind) {
  return AGENT_CATALOG.find((entry) => entry.kind === kind)?.label ?? kind;
}

export function catalogEntryForLabel(label: string): AgentCatalogEntry | undefined {
  const normalized = label.trim().toLowerCase();
  return AGENT_CATALOG.find(
    (entry) =>
      entry.label.toLowerCase() === normalized || entry.kind.toLowerCase() === normalized,
  );
}

export function catalogEntryForKind(kind: AgentKind): AgentCatalogEntry | undefined {
  return AGENT_CATALOG.find((entry) => entry.kind === kind);
}
