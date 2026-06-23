import type { McpServerEntry } from "../../services/mcp_registry";
import {
  hasLocalPackages,
  hasRemoteConnections,
} from "../../services/mcp_registry/parser";
import type { InstalledMcpServer } from "../../services/mcp_installed";

export type McpListCardKind = "local" | "remote" | "mixed";

export const MCP_LIST_KIND_COLORS = {
  local: "#22C55E",
  remote: "#06B6D4",
  mixed: "#8B5CF6",
} as const;

/** Darker icon tint on top of each kind badge background. */
export const MCP_LIST_KIND_ICON_COLORS = {
  local: "#15803D",
  remote: "#0E7490",
  mixed: "#5B21B6",
} as const;

export function getRegistryEntryKind(entry: McpServerEntry): McpListCardKind {
  const hasLocal = hasLocalPackages(entry.server);
  const hasRemote = hasRemoteConnections(entry.server);
  if (hasLocal && hasRemote) {
    return "mixed";
  }
  if (hasRemote) {
    return "remote";
  }
  return "local";
}

export function getInstalledServerKind(
  server: InstalledMcpServer,
  entry?: McpServerEntry | null,
): McpListCardKind {
  if (entry) {
    return getRegistryEntryKind(entry);
  }
  return server.type === "remote" ? "remote" : "local";
}
