import type { NavId } from "../components/Sidebar/Sidebar";
import type { InstalledMcpServer } from "../services/mcp_installed/types";
import {
  getRegistryKeyFromInstalled,
} from "../services/mcp_installed/registryConfig";
import {
  defaultMcpPageSession,
  readPageSession,
  writePageSession,
} from "../session/appSession";

const MCP_PAGE_SESSION_KEY = "mcp-installed";

export const APP_NAVIGATE_EVENT = "tasedeck:app-navigate";

export const APP_OPEN_MCP_SERVER_EVENT = "tasedeck:open-mcp-server";

export type AppNavigateDetail = {
  navId: NavId;
};

export type OpenMcpServerDetail = {
  serverId: number;
};

export function navigateApp(navId: NavId) {
  window.dispatchEvent(
    new CustomEvent<AppNavigateDetail>(APP_NAVIGATE_EVENT, {
      detail: { navId },
    }),
  );
}

export function openMcpServerDetail(server: InstalledMcpServer) {
  if (!server.id) {
    const registryKey = getRegistryKeyFromInstalled(server);
    const fallbackName = server.name.trim();
    if (!registryKey && !fallbackName) {
      return;
    }
    const stored = readPageSession(MCP_PAGE_SESSION_KEY, defaultMcpPageSession());
    writePageSession(MCP_PAGE_SESSION_KEY, {
      ...stored,
      pendingDetailRegistryKey: registryKey,
      pendingDetailServerId: null,
      pendingDetailServerName: registryKey ? null : fallbackName || null,
    });
    navigateApp("mcp");
    return;
  }

  const stored = readPageSession(MCP_PAGE_SESSION_KEY, defaultMcpPageSession());
  writePageSession(MCP_PAGE_SESSION_KEY, {
    ...stored,
    pendingDetailRegistryKey: null,
    pendingDetailServerId: server.id,
    pendingDetailServerName: null,
    selectedInstalledId: server.id,
    selectedRegistryKey: null,
  });
  window.dispatchEvent(
    new CustomEvent<OpenMcpServerDetail>(APP_OPEN_MCP_SERVER_EVENT, {
      detail: { serverId: server.id },
    }),
  );
  navigateApp("mcp");
}

/** @deprecated Use openMcpServerDetail */
export const openMarketServerDetail = openMcpServerDetail;
