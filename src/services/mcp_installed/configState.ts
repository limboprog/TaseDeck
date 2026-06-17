import type { ConfigInput } from "../mcp_registry/parser";
import {
  getRequiredConfigInputs,
  rebuildInstalledMcpConfig,
} from "../mcp_registry/parser";
import type { EnvVariableRow } from "./envEditor";
import {
  envInputsFromRows,
  envValuesFromRows,
  parseStoredEnvRows,
} from "./storedEnv";
import {
  canonicalHeaderId,
  headerNameFromConfigKey,
  headerValuesFromRows,
  parseStoredHeaderRows,
  type HeaderVariableRow,
} from "./storedHeaders";
import type { InstalledMcpServer, McpServerAnalysis } from "./types";
import { inferRunCommandsFromJson, inferRunCommandsFromShell } from "./jsonConfigInference";
import {
  createEmptyRunCommand,
  getActiveRunCommandProfile,
  isRemoteRunTransport,
  normalizeRunCommandsState,
  parseRunCommandsState,
  type RunCommandsState,
} from "./runCommands";
import { canonicalEnvId, normalizeEnvVariableName } from "./variableNames";

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

const EMPTY_ANALYSIS: McpServerAnalysis = {
  runCommands: { activeId: null, commands: [], sharedArgs: [] },
  configInputs: [],
  envVariables: [],
  headerVariables: [],
  compiledCommandTemplate: "",
};

export function getServerAnalysis(server: InstalledMcpServer): McpServerAnalysis {
  return server.analysis ?? EMPTY_ANALYSIS;
}

export function resolveRunCommandsState(options: {
  values: Record<string, string>;
  runCommand?: string;
  jsonConfig?: string;
  analysisRunCommands?: RunCommandsState;
}): RunCommandsState {
  const fromAnalysis = normalizeRunCommandsState(
    options.analysisRunCommands ?? { activeId: null, commands: [], sharedArgs: [] },
  );
  if (fromAnalysis.commands.length > 0) {
    return fromAnalysis;
  }

  const fromValues = parseRunCommandsState(options.values);
  if (fromValues.commands.length > 0) {
    return fromValues;
  }

  const fromJson = options.jsonConfig ? inferRunCommandsFromJson(options.jsonConfig) : null;
  if (fromJson) {
    return fromJson;
  }

  const fromShell = inferRunCommandsFromShell(options.runCommand ?? "");
  if (fromShell) {
    return fromShell;
  }

  const fallbackRunCommand = options.runCommand ?? "";
  if (!fallbackRunCommand.trim()) {
    return { activeId: null, commands: [], sharedArgs: [] };
  }

  const profile = createEmptyRunCommand("stdio");
  profile.command = fallbackRunCommand;
  return { activeId: profile.id, commands: [profile], sharedArgs: [] };
}

export function getServerRunCommands(
  server: InstalledMcpServer,
  analysis?: McpServerAnalysis,
): RunCommandsState {
  return resolveRunCommandsState({
    values: getServerConfigValues(server, analysis),
    runCommand: server.runCommand,
    jsonConfig: server.jsonConfig,
    analysisRunCommands: (analysis ?? getServerAnalysis(server)).runCommands,
  });
}

export function resolveServerConfigInputs(
  server: InstalledMcpServer,
  analysis?: McpServerAnalysis,
): ConfigInput[] {
  return (analysis ?? getServerAnalysis(server)).configInputs;
}

export function getServerConfigInputs(
  server: InstalledMcpServer,
  analysis?: McpServerAnalysis,
): ConfigInput[] {
  return resolveServerConfigInputs(server, analysis);
}

function mergeEnvRows(
  stored: Record<string, string>,
  analysis: McpServerAnalysis,
): EnvVariableRow[] {
  const byName = new Map<string, EnvVariableRow>();

  for (const row of analysis.envVariables) {
    const name = normalizeEnvVariableName(row.name);
    if (!name) {
      continue;
    }
    byName.set(name, {
      id: canonicalEnvId(name),
      name,
      value: "",
      isEditing: false,
    });
  }

  for (const row of parseStoredEnvRows(stored)) {
    const name = normalizeEnvVariableName(row.name);
    if (!name) {
      continue;
    }
    const existing = byName.get(name);
    byName.set(name, {
      id: canonicalEnvId(name),
      name,
      value: row.value.trim() || existing?.value || "",
      isEditing: false,
    });
  }

  return [...byName.values()];
}

function mergeHeaderRows(
  stored: Record<string, string>,
  analysis: McpServerAnalysis,
): HeaderVariableRow[] {
  const byName = new Map<string, HeaderVariableRow>();

  for (const row of analysis.headerVariables) {
    const name = (headerNameFromConfigKey(row.name) ?? row.name).trim();
    if (!name) {
      continue;
    }
    byName.set(name, {
      id: canonicalHeaderId(name),
      name,
      value: row.value,
    });
  }

  for (const row of parseStoredHeaderRows(stored)) {
    const name = (headerNameFromConfigKey(row.name) ?? row.name).trim();
    if (!name) {
      continue;
    }
    const fromAnalysis = byName.get(name);
    const storedValue = row.value.trim();
    const value =
      storedValue.includes("${") || storedValue.includes("{")
        ? storedValue
        : fromAnalysis?.value || storedValue;
    byName.set(name, {
      id: canonicalHeaderId(name),
      name,
      value: value || fromAnalysis?.value || "",
    });
  }

  return [...byName.values()];
}

export function getServerConfigValues(
  server: InstalledMcpServer,
  analysisOverride?: McpServerAnalysis | null,
): Record<string, string> {
  const analysis =
    analysisOverride != null ? analysisOverride : getServerAnalysis(server);
  const stored = parseJsonRecord(server.configValues);

  const envRows = mergeEnvRows(stored, analysis);
  const headerRows = mergeHeaderRows(stored, analysis);

  let values = envRows.length > 0 ? envValuesFromRows(stored, envRows) : stored;
  if (headerRows.length > 0) {
    values = headerValuesFromRows(values, headerRows);
  }

  return values;
}

export function hasPendingEnvRows(values: Record<string, string>): boolean {
  const rows = parseStoredEnvRows(values);
  if (rows.length === 0) {
    return false;
  }
  return rows.some((row) => row.name.trim() && !row.value.trim());
}

function isRemoteProfileConfigured(
  _server: InstalledMcpServer,
  _values: Record<string, string>,
  runCommands: RunCommandsState,
): boolean {
  const profile = getActiveRunCommandProfile(runCommands);
  if (!profile || !isRemoteRunTransport(profile.transport)) {
    return false;
  }
  return Boolean(profile.url?.trim());
}

function stdioRelevantInputs(server: InstalledMcpServer): ConfigInput[] {
  return getServerConfigInputs(server).filter(
    (input) => input.source === "environment" || input.source === "argument",
  );
}

function isStdioProfileConfigured(
  server: InstalledMcpServer,
  values: Record<string, string>,
): boolean {
  if (hasPendingEnvRows(values)) {
    return false;
  }

  const required = getRequiredConfigInputs(stdioRelevantInputs(server));

  if (required.length === 0) {
    return true;
  }

  for (const input of required) {
    const name = normalizeEnvVariableName(input.name);
    const value =
      values[canonicalEnvId(name)]?.trim() ??
      values[input.id]?.trim() ??
      values[name]?.trim() ??
      "";
    if (!value) {
      return false;
    }
  }
  return true;
}

/** Remote: try with URL only (keys optional). Stdio: full config required. */
export function canAttemptMcpTools(
  server: InstalledMcpServer,
  options?: {
    values?: Record<string, string>;
    runCommands?: RunCommandsState;
  },
): boolean {
  if (server.id <= 0) {
    return false;
  }

  const runCommands = options?.runCommands ?? getServerRunCommands(server);
  const profile = getActiveRunCommandProfile(runCommands);
  if (profile && isRemoteRunTransport(profile.transport)) {
    return Boolean(profile.url?.trim());
  }

  if (!profile?.transport && server.jsonConfig.trim()) {
    const inferred = inferRunCommandsFromJson(server.jsonConfig);
    if (inferred) {
      const inferredProfile = getActiveRunCommandProfile(inferred);
      if (inferredProfile && isRemoteRunTransport(inferredProfile.transport)) {
        return Boolean(inferredProfile.url?.trim());
      }
    }
  }

  return isMcpServerConfigured(server, { values: options?.values, runCommands });
}

export function isMcpServerConfigured(
  server: InstalledMcpServer,
  options?: {
    values?: Record<string, string>;
    runCommands?: RunCommandsState;
    analysis?: McpServerAnalysis | null;
  },
): boolean {
  const analysis =
    options?.analysis != null ? options.analysis : undefined;
  const values = options?.values ?? getServerConfigValues(server, analysis);
  const runCommands = options?.runCommands ?? getServerRunCommands(server, analysis);
  const profile = getActiveRunCommandProfile(runCommands);

  if (profile && isRemoteRunTransport(profile.transport)) {
    return isRemoteProfileConfigured(server, values, runCommands);
  }

  return isStdioProfileConfigured(server, values);
}

export function listConfiguredMcpServers(servers: InstalledMcpServer[]) {
  return servers.filter((server) => isMcpServerConfigured(server));
}

export function buildUpdatedMcpServer(
  server: InstalledMcpServer,
  values: Record<string, string>,
  inputsOverride?: ConfigInput[],
  options?: { runCommand?: string },
): InstalledMcpServer {
  const rows = parseStoredEnvRows(values);
  const headerRows = parseStoredHeaderRows(values);
  const persistedValues = headerValuesFromRows(
    envValuesFromRows(values, rows),
    headerRows,
  );
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

  const explicitRun = options?.runCommand?.trim();
  const runCommand = explicitRun || rebuilt.runCommand || server.runCommand;

  return {
    ...server,
    configInputs: JSON.stringify(inputs),
    configValues: JSON.stringify(persistedValues),
    jsonConfig: rebuilt.jsonConfig,
    runCommand,
    analysis: undefined,
  };
}

export function hasPendingRequiredConfig(
  server: InstalledMcpServer,
  values: Record<string, string>,
  runCommands?: RunCommandsState,
  analysis?: McpServerAnalysis | null,
) {
  return !isMcpServerConfigured(server, { values, runCommands, analysis });
}
