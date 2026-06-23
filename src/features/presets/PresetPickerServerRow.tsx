import { openMcpServerDetail } from "../../navigation/appNavigation";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import {
  fetchRegistryEntryForInstalled,
  resolveRegistryEntryFromInstalled,
} from "../../services/mcp_installed";
import { startMcpOAuthSignIn } from "../../services/mcp_installed/oauthApi";
import type { McpListCardConnectionStatus } from "../mcp/mcpConnectionListStatus";
import { McpInstalledListCard } from "../mcp/McpInstalledListCard";
import { resolveInstalledListDescription } from "../mcp/mcpDescriptionCache";
import { presetTreeCardWidthStyle } from "./presetTreeCardLayout";

type PresetPickerServerRowProps = {
  server: InstalledMcpServer;
  connectionStatus?: McpListCardConnectionStatus;
  hovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onPick: () => void;
};

export function PresetPickerServerRow({
  server,
  connectionStatus,
  hovered,
  onHoverStart,
  onHoverEnd,
  onPick,
}: PresetPickerServerRowProps) {
  const registryEntry = resolveRegistryEntryFromInstalled(server);
  void fetchRegistryEntryForInstalled(server);

  return (
    <div
      style={presetTreeCardWidthStyle}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <div
        style={{
          borderRadius: 12,
          transition: "box-shadow 0.15s ease",
          boxShadow: hovered
            ? `0 0 0 1px rgba(139, 92, 246, 0.35), 0 0 8px rgba(139, 92, 246, 0.12)`
            : undefined,
        }}
      >
        <McpInstalledListCard
          server={server}
          registryEntry={registryEntry}
          description={resolveInstalledListDescription(server.id, registryEntry)}
          connectionStatus={connectionStatus}
          hideRefresh
          alwaysShowReadMore
          readMoreTextOnly
          hideActions
          onSelect={onPick}
          onSignIn={() => void startMcpOAuthSignIn(server.id)}
          onReadMore={() => openMcpServerDetail(server)}
        />
      </div>
    </div>
  );
}
