import { useCallback, useEffect, useRef, useState } from "react";
import { resolveMcpListCardConnectionStatus } from "../../features/mcp/mcpConnectionListStatus";
import { emitMcpConnectionStatus } from "../../features/mcp/mcpConnectionProbe";
import {
  clearCachedMcpToolsSnapshot,
  getCachedMcpToolsSnapshot,
  setCachedMcpToolsSnapshot,
} from "./mcpToolsSnapshotCache";
import {
  loadMcpToolEnabledMap,
  replaceMcpToolEnabledMap,
  setMcpToolEnabled,
} from "./mcpToolPreferences";
import {
  ensureMcpTools,
  getMcpToolPrefs,
  refreshMcpTools,
  setMcpToolPref,
  type McpServerToolsSnapshot,
} from "./toolsApi";

async function loadToolPrefs(serverId: number) {
  try {
    const fromDb = await getMcpToolPrefs(serverId);
    if (Object.keys(fromDb).length > 0) {
      replaceMcpToolEnabledMap(serverId, fromDb);
      return fromDb;
    }
  } catch {
    /* fallback to local cache */
  }
  return loadMcpToolEnabledMap(serverId);
}

export function useMcpToolsSession(
  serverId: number,
  active: boolean,
  sessionKey = "",
  toolsResetToken = 0,
) {
  const [snapshot, setSnapshot] = useState<McpServerToolsSnapshot | null>(() => {
    const cached = getCachedMcpToolsSnapshot(serverId);
    return cached === undefined ? null : cached;
  });
  const [loading, setLoading] = useState(false);
  const [toolEnabled, setToolEnabled] = useState<Record<string, boolean>>(() =>
    loadMcpToolEnabledMap(serverId),
  );
  const requestIdRef = useRef(0);
  const sessionIdentityRef = useRef(`${sessionKey}:${toolsResetToken}`);

  const publishConnectionStatus = useCallback((serverId: number, data: McpServerToolsSnapshot | null) => {
    if (serverId <= 0 || !data) {
      return;
    }
    emitMcpConnectionStatus(serverId, resolveMcpListCardConnectionStatus(data));
  }, []);

  const connect = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const data = await ensureMcpTools(serverId);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setCachedMcpToolsSnapshot(serverId, data);
      setSnapshot(data);
      publishConnectionStatus(serverId, data);
    } catch {
      if (requestId === requestIdRef.current) {
        setCachedMcpToolsSnapshot(serverId, null);
        setSnapshot(null);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [publishConnectionStatus, serverId]);

  useEffect(() => {
    const identity = `${sessionKey}:${toolsResetToken}`;
    const identityChanged = sessionIdentityRef.current !== identity;
    sessionIdentityRef.current = identity;

    if (!active) {
      requestIdRef.current += 1;
      setLoading(false);
      const cached = getCachedMcpToolsSnapshot(serverId);
      if (cached !== undefined) {
        setSnapshot(cached);
      }
      return;
    }

    void loadToolPrefs(serverId).then(setToolEnabled);

    if (identityChanged) {
      clearCachedMcpToolsSnapshot(serverId);
    }

    const cached = getCachedMcpToolsSnapshot(serverId);
    if (cached !== undefined && !identityChanged) {
      setSnapshot(cached);
      setLoading(false);
      publishConnectionStatus(serverId, cached);
      return;
    }

    void connect();
  }, [active, connect, publishConnectionStatus, serverId, sessionKey, toolsResetToken]);

  const toggleTool = useCallback(
    (toolName: string, enabled: boolean) => {
      setMcpToolEnabled(serverId, toolName, enabled);
      setToolEnabled((current) => ({ ...current, [toolName]: enabled }));
      void setMcpToolPref(serverId, toolName, enabled).catch((error) => {
        console.error("Failed to save MCP tool preference", error);
        void loadToolPrefs(serverId).then(setToolEnabled);
      });
    },
    [serverId],
  );

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    clearCachedMcpToolsSnapshot(serverId);
    setLoading(true);
    try {
      const data = await refreshMcpTools(serverId);
      if (requestId === requestIdRef.current) {
        setCachedMcpToolsSnapshot(serverId, data);
        setSnapshot(data);
        publishConnectionStatus(serverId, data);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setCachedMcpToolsSnapshot(serverId, null);
        setSnapshot(null);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [publishConnectionStatus, serverId]);

  return {
    snapshot,
    loading,
    toolEnabled,
    toggleTool,
    refresh,
  };
}
