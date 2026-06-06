import { createContext, createElement, useContext, type ReactNode } from "react";
import type { McpServerEntry } from "../mcp_registry";
import {
  hasLocalPackages,
  hasRemoteConnections,
} from "../mcp_registry/parser";
import type { InstalledMcpServer } from "./types";

const InstalledMcpPathsContext = createContext<ReadonlySet<string>>(new Set());

export function InstalledMcpPathsProvider({
  installedPaths,
  children,
}: {
  installedPaths: ReadonlySet<string>;
  children: ReactNode;
}) {
  return createElement(
    InstalledMcpPathsContext.Provider,
    { value: installedPaths },
    children,
  );
}

export function useInstalledMcpPaths() {
  return useContext(InstalledMcpPathsContext);
}

export function buildInstalledPathSet(servers: InstalledMcpServer[]) {
  const paths = new Set<string>();
  for (const server of servers) {
    if (server.path) {
      paths.add(server.path);
    }
    const name = server.name.trim().toLowerCase();
    if (name) {
      paths.add(name);
    }
  }
  return paths;
}

export function getRegistryInstallKey(entry: McpServerEntry) {
  const packageId = entry.server.packages?.[0]?.identifier;
  if (packageId) {
    return packageId;
  }
  const remoteUrl = entry.server.remotes?.[0]?.url;
  if (remoteUrl) {
    return remoteUrl;
  }
  return null;
}

export function getRegistryInstallLookupKeys(entry: McpServerEntry) {
  const keys = new Set<string>();
  const installKey = getRegistryInstallKey(entry);
  if (installKey) {
    keys.add(installKey);
  }
  const displayName = (entry.server.title ?? entry.server.name).trim().toLowerCase();
  if (displayName) {
    keys.add(displayName);
  }
  return keys;
}

export function canAddRegistryEntry(entry: McpServerEntry) {
  const { server } = entry;
  return hasLocalPackages(server) || hasRemoteConnections(server);
}

export function isRegistryEntryInstalled(
  entry: McpServerEntry,
  installedPaths: ReadonlySet<string>,
) {
  for (const key of getRegistryInstallLookupKeys(entry)) {
    if (installedPaths.has(key)) {
      return true;
    }
  }
  return false;
}
