import type { AgentKind } from "./types";
import { resolveAgentsAutoPath } from "./api";

/** Resolves default config folder via Tauri (OS paths + existence check). */
export function resolveAgentConfigDir(kind: AgentKind) {
  return resolveAgentsAutoPath(kind);
}
