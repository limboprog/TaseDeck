import { invoke } from "@tauri-apps/api/core";
import type { RunCommandTransport } from "../mcp_installed/runCommands";

export type McpTransportCatalogEntry = {
  id: RunCommandTransport;
  label: string;
};

let cached: McpTransportCatalogEntry[] | null = null;
let loadPromise: Promise<McpTransportCatalogEntry[]> | null = null;

export function listMcpRunTransports() {
  return invoke<McpTransportCatalogEntry[]>("mcp_list_run_transports");
}

export function getMcpTransportCatalogSync(): McpTransportCatalogEntry[] {
  return cached ?? [];
}

export function loadMcpTransportCatalog(force = false): Promise<McpTransportCatalogEntry[]> {
  if (!force && cached) {
    return Promise.resolve(cached);
  }
  if (!force && loadPromise) {
    return loadPromise;
  }

  loadPromise = listMcpRunTransports()
    .then((entries) => {
      cached = entries;
      return entries;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function transportLabelFromCatalog(
  id: string,
  catalog = getMcpTransportCatalogSync(),
): string {
  return catalog.find((entry) => entry.id === id)?.label ?? id;
}
