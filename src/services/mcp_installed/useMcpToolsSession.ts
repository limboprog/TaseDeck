import { useCallback, useEffect, useRef, useState } from "react";
import { loadMcpToolEnabledMap, setMcpToolEnabled } from "./mcpToolPreferences";
import {
  ensureMcpTools,
  refreshMcpTools,
  type McpServerToolsSnapshot,
} from "./toolsApi";

export function useMcpToolsSession(serverId: number, active: boolean) {
  const [snapshot, setSnapshot] = useState<McpServerToolsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [toolEnabled, setToolEnabled] = useState<Record<string, boolean>>(() =>
    loadMcpToolEnabledMap(serverId),
  );
  const requestIdRef = useRef(0);

  const connect = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const data = await ensureMcpTools(serverId);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setSnapshot(data);
    } catch {
      if (requestId === requestIdRef.current) {
        setSnapshot(null);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [serverId]);

  useEffect(() => {
    if (!active) {
      requestIdRef.current += 1;
      setLoading(false);
      return;
    }
    setToolEnabled(loadMcpToolEnabledMap(serverId));
    void connect();
  }, [active, connect, serverId]);

  const toggleTool = useCallback(
    (toolName: string, enabled: boolean) => {
      setMcpToolEnabled(serverId, toolName, enabled);
      setToolEnabled((current) => ({ ...current, [toolName]: enabled }));
    },
    [serverId],
  );

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const data = await refreshMcpTools(serverId);
      if (requestId === requestIdRef.current) {
        setSnapshot(data);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setSnapshot(null);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [serverId]);

  return {
    snapshot,
    loading,
    toolEnabled,
    toggleTool,
    refresh,
  };
}
