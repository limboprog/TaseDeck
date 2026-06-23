import { memo } from "react";
import type { McpServerEntry } from "../../services/mcp_registry";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import { DEFAULT_MCP_SERVER_DESCRIPTION, getInstalledServerTitle } from "./mcpServerSummary";
import { getInstalledServerKind } from "./mcpListCardKind";
import type { McpListCardConnectionStatus } from "./mcpConnectionListStatus";
import { McpListCardActions } from "./McpListCardActions";
import { McpListCardShell } from "./McpListCardShell";

type McpInstalledListCardProps = {
  server: InstalledMcpServer;
  registryEntry?: McpServerEntry | null;
  connectionStatus?: McpListCardConnectionStatus;
  description?: string;
  selected?: boolean;
  onSelect?: (server: InstalledMcpServer) => void;
  onRefresh?: (server: InstalledMcpServer) => void;
  onDelete?: (server: InstalledMcpServer) => void;
  onSignIn?: (server: InstalledMcpServer) => void;
  onReadMore?: (server: InstalledMcpServer) => void;
  refreshing?: boolean;
  hideRefresh?: boolean;
  hideActions?: boolean;
  alwaysShowReadMore?: boolean;
  readMoreTextOnly?: boolean;
  hideDescription?: boolean;
};

function McpInstalledListCardInner({
  server,
  registryEntry = null,
  connectionStatus,
  description = DEFAULT_MCP_SERVER_DESCRIPTION,
  selected = false,
  onSelect,
  onRefresh,
  onDelete,
  onSignIn,
  onReadMore,
  refreshing = false,
  hideRefresh = false,
  hideActions = false,
  alwaysShowReadMore = false,
  readMoreTextOnly = false,
  hideDescription = false,
}: McpInstalledListCardProps) {
  return (
    <McpListCardShell
      kind={getInstalledServerKind(server, registryEntry)}
      title={getInstalledServerTitle(server, registryEntry)}
      description={description}
      selected={selected}
      onPress={() => onSelect?.(server)}
      showConnectionStatus
      connectionStatus={connectionStatus}
      onSignIn={onSignIn ? () => onSignIn(server) : undefined}
      onReadMore={onReadMore ? () => onReadMore(server) : undefined}
      alwaysShowReadMore={alwaysShowReadMore}
      readMoreTextOnly={readMoreTextOnly}
      hideDescription={hideDescription}
      actions={
        hideActions ? null : (
          <McpListCardActions
            installedServer={server}
            onRefresh={onRefresh ? () => onRefresh(server) : undefined}
            onDelete={onDelete ? () => onDelete(server) : undefined}
            refreshing={refreshing}
            hideRefresh={hideRefresh}
            deleteLabel={`Remove ${server.name}`}
          />
        )
      }
    />
  );
}

export const McpInstalledListCard = memo(
  McpInstalledListCardInner,
  (prev, next) =>
    prev.server.id === next.server.id &&
    prev.server.updatedAt === next.server.updatedAt &&
    prev.registryEntry === next.registryEntry &&
    prev.connectionStatus === next.connectionStatus &&
    prev.description === next.description &&
    prev.selected === next.selected &&
    prev.refreshing === next.refreshing &&
    prev.onSelect === next.onSelect &&
    prev.onRefresh === next.onRefresh &&
    prev.onDelete === next.onDelete &&
    prev.onSignIn === next.onSignIn &&
    prev.onReadMore === next.onReadMore &&
    prev.hideRefresh === next.hideRefresh &&
    prev.hideActions === next.hideActions &&
    prev.alwaysShowReadMore === next.alwaysShowReadMore &&
    prev.readMoreTextOnly === next.readMoreTextOnly &&
    prev.hideDescription === next.hideDescription,
);
