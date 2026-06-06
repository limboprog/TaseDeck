import { hasLocalPackages, hasRemoteConnections } from "./parser";
import type { McpServerEntry, McpSourceId } from "./types";

export function filterByConnection(
  entries: McpServerEntry[],
  source: McpSourceId,
): McpServerEntry[] {
  switch (source) {
    case "local":
      return entries.filter((entry) => hasLocalPackages(entry.server));
    case "remote":
      return entries.filter((entry) => hasRemoteConnections(entry.server));
    default:
      return entries;
  }
}
