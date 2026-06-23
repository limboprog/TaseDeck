import type { McpProbeResult } from "../../services/mcp_installed/probeApi";
import type { McpServerToolsSnapshot } from "../../services/mcp_installed/toolsApi";
import { parseAuthRequiredError } from "../../services/mcp_installed/oauthApi";

export type McpListCardConnectionStatus = "connected" | "auth" | "failed";

export function resolveMcpListCardConnectionStatus(
  snapshot: McpServerToolsSnapshot | null | undefined,
): McpListCardConnectionStatus {
  if (!snapshot) {
    return "failed";
  }
  if (!snapshot.error) {
    return "connected";
  }
  if (parseAuthRequiredError(snapshot.error)) {
    return "auth";
  }
  return "failed";
}

export function resolveMcpListCardConnectionStatusFromProbe(
  result: McpProbeResult,
): McpListCardConnectionStatus {
  if (result.success) {
    return "connected";
  }
  if (parseAuthRequiredError(result.result)) {
    return "auth";
  }
  return "failed";
}
