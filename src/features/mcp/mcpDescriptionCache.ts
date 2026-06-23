import type { McpServerEntry } from "../../services/mcp_registry";
import { entryKey } from "../../services/mcp_registry/searchCore";
import {
  DEFAULT_MCP_SERVER_DESCRIPTION,
  getRegistryServerDescription,
} from "./mcpServerSummary";

const byRegistryKey = new Map<string, string>();
const byInstalledId = new Map<number, string>();

export function rememberRegistryEntry(entry: McpServerEntry) {
  const description = getRegistryServerDescription(entry);
  byRegistryKey.set(entryKey(entry), description);
  return description;
}

export function rememberRegistryEntries(entries: McpServerEntry[]) {
  for (const entry of entries) {
    rememberRegistryEntry(entry);
  }
}

export function rememberInstalledDescription(installedId: number, description: string) {
  byInstalledId.set(installedId, description);
}

export function linkInstalledToRegistry(installedId: number, registryKey: string) {
  const cached = byRegistryKey.get(registryKey);
  if (cached) {
    byInstalledId.set(installedId, cached);
  }
}

export function getCachedRegistryDescription(registryKey: string) {
  return byRegistryKey.get(registryKey);
}

export function getCachedInstalledDescription(installedId: number) {
  return byInstalledId.get(installedId);
}

/** Stable list-card description — cached once, never tied to selection. */
export function resolveInstalledListDescription(
  installedId: number,
  registryEntry?: McpServerEntry | null,
): string {
  const cached = byInstalledId.get(installedId);
  if (cached) {
    return cached;
  }

  const description = registryEntry
    ? getRegistryServerDescription(registryEntry)
    : DEFAULT_MCP_SERVER_DESCRIPTION;
  byInstalledId.set(installedId, description);
  return description;
}
