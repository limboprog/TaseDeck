import type { McpServerEntry } from "../mcp_registry";
import { registrySearchCache } from "../mcp_registry/cache";
import {
  collectPackageConfigInputs,
  environmentVariablesToConfigInputs,
  parseServerSetup,
  type ConfigInput,
} from "../mcp_registry/parser";
import type { InstalledMcpServer } from "./types";

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

export function findRegistryEntryByPackageIdentifier(
  identifier: string,
): McpServerEntry | null {
  const target = normalizeIdentifier(identifier);
  if (!target) {
    return null;
  }

  for (const { session } of registrySearchCache.exportAllSessions()) {
    for (const entry of session.servers) {
      const packages = entry.server.packages ?? [];
      if (
        packages.some((pkg) => packageMatchesIdentifier(target, pkg.identifier))
      ) {
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
