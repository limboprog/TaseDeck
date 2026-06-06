import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AgentCatalogEntry, AgentConfigInfo, AgentKind } from "./types";

export function listAgentCatalog() {
  return invoke<AgentCatalogEntry[]>("agents_list_catalog");
}

export function getAgentConfig(kind: AgentKind) {
  return invoke<AgentConfigInfo>("agents_get_config", { kind });
}

export function readAgentMcpJson(kind: AgentKind) {
  return invoke<Record<string, unknown> | null>("agents_read_mcp_json", { kind });
}

export function ensureAgentMcpJson(kind: AgentKind) {
  return invoke<string>("agents_ensure_mcp_json", { kind });
}

/** Returns config dir path when the folder exists, otherwise null. */
export function resolveAgentsAutoPath(kind: AgentKind) {
  return invoke<string | null>("agents_resolve_auto_path", { kind });
}

export async function pickConfigDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select config folder",
  });

  if (selected === null || Array.isArray(selected)) {
    return null;
  }
  return selected;
}
