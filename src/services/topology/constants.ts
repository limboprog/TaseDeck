import type { AgentKind } from "./types";

export const AGENT_OPTIONS: Array<{ kind: AgentKind; label: string }> = [
  { kind: "cursor", label: "Cursor" },
  { kind: "claude-code", label: "Claude Code" },
  { kind: "antigravity", label: "Antigravity" },
  { kind: "copilot", label: "Copilot" },
];

export function agentLabel(kind: AgentKind) {
  return AGENT_OPTIONS.find((option) => option.kind === kind)?.label ?? kind;
}
