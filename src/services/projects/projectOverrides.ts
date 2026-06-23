import type { InstalledMcpServer } from "../mcp_installed";
import { getServerRunCommands } from "../mcp_installed/configState";
import type { RunCommandsState } from "../mcp_installed/runCommands";
import { normalizeRunCommandsState } from "../mcp_installed/runCommands";

export type ProjectServerOverridePatch = {
  env?: Record<string, string>;
  args?: string[];
  headers?: Record<string, string>;
  runCommands?: RunCommandsState;
  /** Tool name → enabled. Omitted tools default to enabled in project export. */
  toolPrefs?: Record<string, boolean>;
};

export type ProjectConfigOverrides = Record<string, ProjectServerOverridePatch>;

export function parseProjectConfigOverrides(raw: string): ProjectConfigOverrides {
  if (!raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ProjectConfigOverrides;
  } catch {
    return {};
  }
}

function readJsonObject(raw: string): Record<string, unknown> {
  if (!raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function readServerEnvFromJsonConfig(jsonConfig: string): Record<string, string> {
  const root = readJsonObject(jsonConfig);
  const env = root.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (value != null) {
      result[key] = String(value);
    }
  }
  return result;
}

export function readServerArgsFromJsonConfig(jsonConfig: string): string[] {
  const root = readJsonObject(jsonConfig);
  const args = root.args;
  if (!Array.isArray(args)) {
    return [];
  }
  return args.map((value) => (typeof value === "string" ? value : String(value ?? "")));
}

export function mergeServerEnvValues(
  jsonConfig: string,
  overrides: ProjectConfigOverrides,
  serverKey: string,
): Record<string, string> {
  const base = readServerEnvFromJsonConfig(jsonConfig);
  const patch = overrides[serverKey]?.env ?? {};
  return { ...base, ...patch };
}

export function mergeServerArgsValues(
  jsonConfig: string,
  overrides: ProjectConfigOverrides,
  serverKey: string,
): string[] {
  const base = readServerArgsFromJsonConfig(jsonConfig);
  const patch = overrides[serverKey]?.args;
  if (!patch || patch.length === 0) {
    return base;
  }
  if (base.length === 0) {
    return [...patch];
  }
  const merged = [...base];
  for (let index = 0; index < patch.length; index += 1) {
    merged[index] = patch[index] ?? merged[index] ?? "";
  }
  if (patch.length > merged.length) {
    merged.push(...patch.slice(merged.length));
  }
  return merged;
}

export function patchServerEnv(
  overrides: ProjectConfigOverrides,
  serverKey: string,
  env: Record<string, string>,
): ProjectConfigOverrides {
  const next = { ...overrides };
  const existing = { ...(next[serverKey] ?? {}) };
  next[serverKey] = { ...existing, env };
  return next;
}

export function patchServerArgs(
  overrides: ProjectConfigOverrides,
  serverKey: string,
  args: string[],
): ProjectConfigOverrides {
  const next = { ...overrides };
  const existing = { ...(next[serverKey] ?? {}) };
  next[serverKey] = { ...existing, args };
  return next;
}

export function mergeServerOverridePatch(
  overrides: ProjectConfigOverrides,
  serverKey: string,
  patch: ProjectServerOverridePatch,
): ProjectConfigOverrides {
  const next = { ...overrides };
  if (Object.keys(patch).length === 0) {
    delete next[serverKey];
    return next;
  }
  next[serverKey] = { ...(next[serverKey] ?? {}), ...patch };
  return next;
}

export function serializeProjectConfigOverrides(overrides: ProjectConfigOverrides): string {
  return JSON.stringify(overrides);
}

export function stripServerOverrideKeys(
  overrides: ProjectConfigOverrides,
  serverKey: string,
): ProjectConfigOverrides {
  const next = { ...overrides };
  delete next[serverKey];
  return next;
}

export function mergeServerRunCommands(
  server: InstalledMcpServer,
  overrides: ProjectConfigOverrides,
  serverKey: string,
): RunCommandsState {
  const patch = overrides[serverKey]?.runCommands;
  if (patch) {
    return normalizeRunCommandsState(patch);
  }
  return getServerRunCommands(server);
}

export function patchServerRunCommands(
  overrides: ProjectConfigOverrides,
  serverKey: string,
  runCommands: RunCommandsState,
): ProjectConfigOverrides {
  const next = { ...overrides };
  const existing = { ...(next[serverKey] ?? {}) };
  next[serverKey] = { ...existing, runCommands };
  return next;
}
