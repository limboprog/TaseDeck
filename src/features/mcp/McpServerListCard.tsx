import { memo } from "react";
import { entryKey, type McpServerEntry } from "../../services/mcp_registry";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import {
  getRegistryServerDescription,
  getRegistryServerTitle,
} from "./mcpServerSummary";
import { getRegistryEntryKind } from "./mcpListCardKind";
import { McpListCardActions } from "./McpListCardActions";
import { McpListCardShell } from "./McpListCardShell";

type McpServerListCardProps = {
  entry: McpServerEntry;
  installedServer?: InstalledMcpServer | null;
  selected?: boolean;
  onSelect?: (entry: McpServerEntry) => void;
  onInstalled?: (server: InstalledMcpServer) => void;
  onRefresh?: (server: InstalledMcpServer) => void;
  onDelete?: (server: InstalledMcpServer) => void;
  refreshing?: boolean;
};

function McpServerListCardInner({
  entry,
  installedServer = null,
  selected = false,
  onSelect,
  onInstalled,
  onRefresh,
  onDelete,
  refreshing = false,
}: McpServerListCardProps) {
  const title = getRegistryServerTitle(entry);
  const description = getRegistryServerDescription(entry);
  const isInstalled = installedServer != null;

  return (
    <div data-registry-entry-key={entryKey(entry)} style={{ width: "100%" }}>
      <McpListCardShell
        kind={getRegistryEntryKind(entry)}
        title={title}
        description={description}
        selected={selected}
        onPress={() => onSelect?.(entry)}
        actions={
          <McpListCardActions
            entry={isInstalled ? null : entry}
            installedServer={installedServer}
            onInstalled={onInstalled}
            onRefresh={
              installedServer && onRefresh
                ? () => onRefresh(installedServer)
                : undefined
            }
            onDelete={
              installedServer && onDelete
                ? () => onDelete(installedServer)
                : undefined
            }
            refreshing={refreshing}
            deleteLabel={`Delete ${installedServer?.name || title}`}
          />
        }
      />
    </div>
  );
}

export const McpServerListCard = memo(
  McpServerListCardInner,
  (prev, next) =>
    entryKey(prev.entry) === entryKey(next.entry) &&
    prev.installedServer?.id === next.installedServer?.id &&
    prev.selected === next.selected &&
    prev.refreshing === next.refreshing &&
    prev.onSelect === next.onSelect &&
    prev.onInstalled === next.onInstalled &&
    prev.onRefresh === next.onRefresh &&
    prev.onDelete === next.onDelete,
);
