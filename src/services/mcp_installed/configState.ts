import type { ConfigInput } from "../mcp_registry/parser";
import {
  getRequiredConfigInputs,
  rebuildInstalledMcpConfig,
} from "../mcp_registry/parser";
import {
  ENV_VARIABLES_CONFIG_KEY,
  envInputsFromRows,
  envValuesFromRows,
  parseStoredEnvRows,
} from "./storedEnv";
import {
  getRegistryConfigInputsForInstalled,
  registryEnvToConfigInputs,
} from "./registryConfig";
import type { InstalledMcpServer } from "./types";

function parseJsonArray<T>(raw: string | undefined): T[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        record[key] = value;
      } else if (value !== null && value !== undefined) {
        record[key] = String(value);
      }
    }
    return record;
  } catch {
    return {};
  }
}

function envInputFromName(name: string, isRequired = true): ConfigInput {
  return {
    id: `env:${name}`,
    name,
    isRequired,
    isSecret: /key|token|secret|password|credential/i.test(name),
    source: "environment",
  };
}

function dedupeInputs(inputs: ConfigInput[]) {
  const byId = new Map<string, ConfigInput>();
  for (const input of inputs) {
    byId.set(input.id, input);
  }
  return [...byId.values()];
}

export function inferConfigInputsFromJson(jsonConfig: string): ConfigInput[] {
  try {
    const parsed = JSON.parse(jsonConfig) as {
      mcpServers?: Record<string, { env?: Record<string, unknown> }>;
    };
    const entry = Object.values(parsed.mcpServers ?? {})[0];
    const env = entry?.env ?? {};
    return Object.keys(env).map((name) => envInputFromName(name));
  } catch {
    return [];
  }
}

export function inferConfigInputsFromRunCommand(runCommand: string): ConfigInput[] {
  const names = new Set<string>();
  const pattern = /(?:^|[\s;])([A-Z][A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|[^\s]+)/g;

  for (const match of runCommand.matchAll(pattern)) {
    names.add(match[1]);
  }

  return [...names].map((name) => envInputFromName(name));
}

function inferValuesFromJsonEnv(jsonConfig: string): Record<string, string> {
  try {
    const parsed = JSON.parse(jsonConfig) as {
      mcpServers?: Record<string, { env?: Record<string, unknown> }>;
    };
    const entry = Object.values(parsed.mcpServers ?? {})[0];
    const env = entry?.env ?? {};
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries(env)) {
      const text =
        typeof value === "string"
          ? value
          : value === null || value === undefined
            ? ""
            : String(value);
      values[`env:${name}`] = text;
      values[name] = text;
    }
    return values;
  } catch {
    return {};
  }
}

function inferValuesFromRunCommand(runCommand: string): Record<string, string> {
  const values: Record<string, string> = {};
  const pattern = /(?:^|[\s;])([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

  for (const match of runCommand.matchAll(pattern)) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    values[`env:${name}`] = value;
    values[name] = value;
  }

  return values;
}

export function resolveServerConfigInputs(server: InstalledMcpServer): ConfigInput[] {
  const stored = parseJsonArray<ConfigInput>(server.configInputs);
  const fromRegistry = getRegistryConfigInputsForInstalled(server);
  const fromRegistryEnv = registryEnvToConfigInputs(server);
  const fromJson = inferConfigInputsFromJson(server.jsonConfig);
  const fromRun = inferConfigInputsFromRunCommand(server.runCommand);

  return dedupeInputs([
    ...stored,
    ...fromRegistry,
    ...fromRegistryEnv,
    ...fromJson,
    ...fromRun,
  ]);
}

export function getServerConfigInputs(server: InstalledMcpServer): ConfigInput[] {
  return resolveServerConfigInputs(server);
}

export function getServerConfigValues(server: InstalledMcpServer): Record<string, string> {
  const stored = parseJsonRecord(server.configValues);
  const rows = parseStoredEnvRows(stored);

  if (stored[ENV_VARIABLES_CONFIG_KEY]?.trim() || rows.length > 0) {
    return envValuesFromRows(stored, rows);
  }

  const fromJson = inferValuesFromJsonEnv(server.jsonConfig);
  const fromRun = inferValuesFromRunCommand(server.runCommand);
  const merged = { ...fromRun, ...fromJson, ...stored };
  return envValuesFromRows(merged, parseStoredEnvRows(merged));
}

export function isMcpServerConfigured(server: InstalledMcpServer): boolean {
  const inputs = getServerConfigInputs(server);
  const required = getRequiredConfigInputs(inputs);

  if (required.length === 0) {
    return true;
  }

  const values = getServerConfigValues(server);
  for (const input of required) {
    const value = values[input.id]?.trim() ?? values[input.name]?.trim() ?? "";
    if (!value) {
      return false;
    }
  }
  return true;
}

export function listConfiguredMcpServers(servers: InstalledMcpServer[]) {
  return servers.filter(isMcpServerConfigured);
}

function escapeShell(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function applyEnvToRunCommand(
  runCommand: string,
  env: Record<string, string>,
): string {
  let next = runCommand.trim();

  for (const [name, value] of Object.entries(env)) {
    if (!value.trim()) {
      continue;
    }

    const assignment = `${name}="${escapeShell(value)}"`;
    const pattern = new RegExp(`(^|[\\s;])${name}=(\"[^\"]*\"|'[^']*'|[^\\s]+)`);
    if (pattern.test(next)) {
      next = next.replace(pattern, `$1${assignment}`);
    } else {
      next = next ? `${assignment} ${next}` : assignment;
    }
  }

  return next;
}

export function buildUpdatedMcpServer(
  server: InstalledMcpServer,
  values: Record<string, string>,
  inputsOverride?: ConfigInput[],
  options?: { runCommand?: string },
): InstalledMcpServer {
  const rows = parseStoredEnvRows(values);
  const persistedValues = envValuesFromRows(values, rows);
  const inputs = envInputsFromRows(
    inputsOverride ?? resolveServerConfigInputs(server),
    rows,
  );
  const rebuilt = rebuildInstalledMcpConfig(
    inputs,
    persistedValues,
    server.jsonConfig,
    server.name,
  );

  const env: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (name && row.value.trim()) {
      env[name] = row.value;
    }
  }

  const explicitRun = options?.runCommand?.trim();
  const runCommand = explicitRun
    ? applyEnvToRunCommand(explicitRun, env)
    : applyEnvToRunCommand(rebuilt.runCommand || server.runCommand, env);

  return {
    ...server,
    configInputs: JSON.stringify(inputs),
    configValues: JSON.stringify(persistedValues),
    jsonConfig: rebuilt.jsonConfig,
    runCommand,
  };
}

export function hasPendingRequiredConfig(
  server: InstalledMcpServer,
  values: Record<string, string>,
) {
  return !isMcpServerConfigured({
    ...server,
    configValues: JSON.stringify(values),
  });
}
