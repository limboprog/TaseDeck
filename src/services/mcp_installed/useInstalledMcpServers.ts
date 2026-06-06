import { useCallback, useEffect, useState } from "react";
import { listInstalledMcpServers } from "./api";
import {
  MCP_INSTALLED_EVENT,
  MCP_REMOVED_EVENT,
  type InstalledMcpServer,
} from "./types";

export function useInstalledMcpServers() {
  const [servers, setServers] = useState<InstalledMcpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const next = await listInstalledMcpServers();
      setServers(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleInstalled = () => {
      void refresh({ silent: true });
    };

    const handleRemoved = (event: Event) => {
      const serverId = (event as CustomEvent<number>).detail;
      if (typeof serverId === "number") {
        setServers((current) => current.filter((server) => server.id !== serverId));
      }
      void refresh({ silent: true });
    };

    window.addEventListener(MCP_INSTALLED_EVENT, handleInstalled);
    window.addEventListener(MCP_REMOVED_EVENT, handleRemoved);
    return () => {
      window.removeEventListener(MCP_INSTALLED_EVENT, handleInstalled);
      window.removeEventListener(MCP_REMOVED_EVENT, handleRemoved);
    };
  }, [refresh]);

  return {
    servers,
    loading,
    error,
    refresh,
  };
}
