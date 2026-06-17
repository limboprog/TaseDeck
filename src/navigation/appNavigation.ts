import type { NavId } from "../components/Sidebar/Sidebar";
import type { InstalledMcpServer } from "../services/mcp_installed/types";
import {
  getRegistryKeyFromInstalled,
} from "../services/mcp_installed/registryConfig";
import {
  defaultMarketPageSession,
  MARKET_PAGE_SESSION_KEY,
  writePageSession,
} from "../session/appSession";

export const APP_NAVIGATE_EVENT = "tasedeck:app-navigate";

export type AppNavigateDetail = {
  navId: NavId;
};

export function navigateApp(navId: NavId) {
  window.dispatchEvent(
    new CustomEvent<AppNavigateDetail>(APP_NAVIGATE_EVENT, {
      detail: { navId },
    }),
  );
}

export function openMarketServerDetail(server: InstalledMcpServer) {
  const registryKey = getRegistryKeyFromInstalled(server);
  const fallbackName = server.name.trim();
  if (!registryKey && !server.id && !fallbackName) {
    return;
  }
  writePageSession(MARKET_PAGE_SESSION_KEY, {
    ...defaultMarketPageSession(),
    pendingDetailRegistryKey: registryKey,
    pendingDetailServerId: registryKey ? null : server.id || null,
    pendingDetailServerName:
      registryKey || server.id ? null : fallbackName || null,
  });
  navigateApp("market");
}
