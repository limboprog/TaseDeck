import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import { canAttemptMcpTools } from "../../services/mcp_installed/configState";
import { clearCachedMcpToolsSnapshot } from "../../services/mcp_installed/mcpToolsSnapshotCache";
import {
  listenMcpOAuthSignInComplete,
  listenMcpOAuthSignInRequired,
} from "../../services/mcp_installed/oauthApi";
import { refreshMcpTools } from "../../services/mcp_installed/toolsApi";
import {
  MCP_CONNECTION_STATUS_EVENT,
  probeMcpConnectionStatus,
  type McpConnectionStatusEventDetail,
} from "./mcpConnectionProbe";
import {
  resolveMcpListCardConnectionStatus,
  type McpListCardConnectionStatus,
} from "./mcpConnectionListStatus";
import {
  clearCachedMcpConnectionStatus,
  getCachedMcpConnectionStatus,
  hasCachedMcpConnectionStatus,
  setCachedMcpConnectionStatus,
  snapshotCachedMcpConnectionStatuses,
} from "./mcpConnectionStatusSession";

type RefreshStatusOptions = {
  force?: boolean;
};

function parseServerStatusKey(key: string): Map<number, string> {
  const revisions = new Map<number, string>();
  if (!key) {
    return revisions;
  }
  for (const part of key.split(",")) {
    const separator = part.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const id = Number(part.slice(0, separator));
    const updatedAt = part.slice(separator + 1);
    if (Number.isFinite(id) && updatedAt) {
      revisions.set(id, updatedAt);
    }
  }
  return revisions;
}

export function useMcpInstalledConnectionStatuses(servers: InstalledMcpServer[]) {
  const serversRef = useRef(servers);
  serversRef.current = servers;

  const serverStatusKey = useMemo(
    () =>
      servers
        .filter((server) => server.id > 0)
        .sort((a, b) => a.id - b.id)
        .map((server) => `${server.id}:${server.updatedAt}`)
        .join(","),
    [servers],
  );

  const [statuses, setStatuses] = useState<Record<number, McpListCardConnectionStatus>>(() =>
    snapshotCachedMcpConnectionStatuses(servers.map((server) => server.id)),
  );

  const refreshStatus = useCallback(
    (server: InstalledMcpServer, options?: RefreshStatusOptions) => {
      const force = options?.force ?? false;

      if (server.id <= 0 || !canAttemptMcpTools(server)) {
        if (force) {
          clearCachedMcpConnectionStatus(server.id);
          clearCachedMcpToolsSnapshot(server.id);
        }
        setStatuses((current) => {
          if (current[server.id] === undefined) {
            return current;
          }
          const next = { ...current };
          delete next[server.id];
          return next;
        });
        return;
      }

      if (!force && getCachedMcpConnectionStatus(server.id) !== undefined) {
        return;
      }

      if (force) {
        clearCachedMcpConnectionStatus(server.id);
        clearCachedMcpToolsSnapshot(server.id);
        void refreshMcpTools(server.id)
          .then((snapshot) => {
            const status = resolveMcpListCardConnectionStatus(snapshot);
            setCachedMcpConnectionStatus(server.id, status);
            setStatuses((current) => ({
              ...current,
              [server.id]: status,
            }));
          })
          .catch(() => {
            setCachedMcpConnectionStatus(server.id, "failed");
            setStatuses((current) => ({
              ...current,
              [server.id]: "failed",
            }));
          });
        return;
      }

      void probeMcpConnectionStatus(server).then((status) => {
        if (status == null) {
          return;
        }
        setStatuses((current) => ({
          ...current,
          [server.id]: status,
        }));
      });
    },
    [],
  );

  const prevServerStatusKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const currentServers = serversRef.current;
    const ids = currentServers.map((server) => server.id);
    const prevKey = prevServerStatusKeyRef.current;
    const keyChanged = prevKey !== serverStatusKey;
    prevServerStatusKeyRef.current = serverStatusKey;

    if (keyChanged) {
      const prevRevisions = parseServerStatusKey(prevKey ?? "");

      for (const server of currentServers) {
        if (server.id <= 0) {
          continue;
        }

        const prevUpdatedAt = prevRevisions.get(server.id);
        const isInitialLoad = prevKey == null;
        const isNewServer = !isInitialLoad && prevUpdatedAt === undefined;
        const configChanged =
          prevUpdatedAt !== undefined && prevUpdatedAt !== String(server.updatedAt);

        if (isInitialLoad || configChanged) {
          clearCachedMcpConnectionStatus(server.id);
          clearCachedMcpToolsSnapshot(server.id);
          refreshStatus(server);
          continue;
        }

        if (isNewServer) {
          continue;
        }

        if (!hasCachedMcpConnectionStatus(server.id)) {
          refreshStatus(server);
        }
      }
    }

    setStatuses(snapshotCachedMcpConnectionStatuses(ids));
  }, [refreshStatus, serverStatusKey]);

  useEffect(() => {
    const onStatusUpdated = (event: Event) => {
      const detail = (event as CustomEvent<McpConnectionStatusEventDetail>).detail;
      if (!detail) {
        return;
      }
      setStatuses((current) => ({
        ...current,
        [detail.serverId]: detail.status,
      }));
    };

    window.addEventListener(MCP_CONNECTION_STATUS_EVENT, onStatusUpdated);
    return () => window.removeEventListener(MCP_CONNECTION_STATUS_EVENT, onStatusUpdated);
  }, []);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let cancelled = false;
    const currentServers = serversRef.current;

    void (async () => {
      for (const server of currentServers) {
        if (server.id <= 0) {
          continue;
        }
        const unlistenRequired = await listenMcpOAuthSignInRequired(server.id, () => {
          setCachedMcpConnectionStatus(server.id, "auth");
          setStatuses((current) => ({ ...current, [server.id]: "auth" }));
        });
        if (cancelled) {
          unlistenRequired();
        } else {
          unlisteners.push(unlistenRequired);
        }

        const unlistenComplete = await listenMcpOAuthSignInComplete(server.id, () => {
          refreshStatus(server, { force: true });
        });
        if (cancelled) {
          unlistenComplete();
        } else {
          unlisteners.push(unlistenComplete);
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [refreshStatus, serverStatusKey]);

  return { statuses, refreshStatus };
};
