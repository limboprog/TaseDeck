import type { McpServerEntry } from "../mcp_registry";
import { registrySearchCache } from "../mcp_registry/cache";
import {
  fetchCatalogPage,
  fetchRegistryServerByKey,
} from "../mcp_registry/registryFetch";
import {
  collectPackageConfigInputs,
  environmentVariablesToConfigInputs,
  parseServerSetup,
  type ConfigInput,
} from "../mcp_registry/parser";
import { entryKey } from "../mcp_registry/searchCore";
import { getServerConfigValues } from "./configState";
import { REGISTRY_KEY_CONFIG_KEY } from "./runCommands";
import type { InstalledMcpServer } from "./types";

export { REGISTRY_KEY_CONFIG_KEY };

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function packageMatchesIdentifier(
  identifier: string,
  packageIdentifier: string,
) {
  const left = normalizeIdentifier(identifier);
  const right = normalizeIdentifier(packageIdentifier);
  if (!left || !right) {
    return false;
  }
  return left === right || right.endsWith(left) || left.endsWith(right);
}

export function getRegistryKeyFromInstalled(
  server: InstalledMcpServer,
): string | null {
  const values = getServerConfigValues(server);
  const stored = values[REGISTRY_KEY_CONFIG_KEY]?.trim();
  if (stored) {
    return stored;
  }
  return null;
}

export function findRegistryEntryByRegistryKey(
  registryKey: string,
): McpServerEntry | null {
  const target = registryKey.trim().toLowerCase();
  if (!target) {
    return null;
  }

  for (const { session } of registrySearchCache.exportAllSessions()) {
    for (const entry of session.servers) {
      if (entryKey(entry).toLowerCase() === target) {
        return entry;
      }
    }
  }

  return null;
}

export function resolveRegistryEntryFromInstalled(
  server: InstalledMcpServer,
): McpServerEntry | null {
  const registryKey = getRegistryKeyFromInstalled(server);
  if (registryKey) {
    const byKey = findRegistryEntryByRegistryKey(registryKey);
    if (byKey) {
      return byKey;
    }
  }

  if (server.path?.trim()) {
    const byPath = findRegistryEntryByPackageIdentifier(server.path);
    if (byPath) {
      return byPath;
    }
  }

  return null;
}

export async function fetchRegistryEntryForInstalled(
  server: InstalledMcpServer,
): Promise<McpServerEntry | null> {
  const cached = resolveRegistryEntryFromInstalled(server);
  if (cached) {
    return cached;
  }

  const registryKey = getRegistryKeyFromInstalled(server);
  if (registryKey) {
    return fetchRegistryServerByKey(registryKey);
  }

  const installPath = server.path?.trim();
  if (!installPath) {
    return null;
  }

  const page = await fetchCatalogPage({ search: installPath, limit: 50 });
  return (
    page.servers.find((entry) => entryMatchesInstallPath(entry, installPath)) ??
    null
  );
}

function entryMatchesInstallPath(entry: McpServerEntry, installPath: string) {
  const target = normalizeIdentifier(installPath);
  if (!target) {
    return false;
  }

  const packages = entry.server.packages ?? [];
  if (
    packages.some((pkg) => packageMatchesIdentifier(target, pkg.identifier))
  ) {
    return true;
  }

  const remotes = entry.server.remotes ?? [];
  return remotes.some(
    (remote) => normalizeIdentifier(remote.url) === target,
  );
}

export function findRegistryEntryByPackageIdentifier(
  identifier: string,
): McpServerEntry | null {
  const target = normalizeIdentifier(identifier);
  if (!target) {
    return null;
  }

  for (const { session } of registrySearchCache.exportAllSessions()) {
    for (const entry of session.servers) {
      if (entryMatchesInstallPath(entry, identifier)) {
        return entry;
      }
    }
  }

  return null;
}

export function getRegistryConfigInputsForInstalled(
  server: InstalledMcpServer,
): ConfigInput[] {
  if (!server.path?.trim()) {
    return [];
  }

  const entry = findRegistryEntryByPackageIdentifier(server.path);
  if (!entry) {
    return [];
  }

  const setup = parseServerSetup(entry).localSetups[0];
  if (setup?.inputs.length) {
    return setup.inputs;
  }

  const pkg = entry.server.packages?.[0];
  if (!pkg) {
    return [];
  }

  return collectPackageConfigInputs(pkg);
}

export function getRegistryEnvironmentVariablesForInstalled(
  server: InstalledMcpServer,
) {
  if (!server.path?.trim()) {
    return [];
  }

  const entry = findRegistryEntryByPackageIdentifier(server.path);
  const pkg = entry?.server.packages?.find((item) =>
    packageMatchesIdentifier(server.path!, item.identifier),
  );
  return pkg?.environmentVariables ?? [];
}

export function registryEnvToConfigInputs(
  server: InstalledMcpServer,
): ConfigInput[] {
  return environmentVariablesToConfigInputs(
    getRegistryEnvironmentVariablesForInstalled(server),
  );
}
