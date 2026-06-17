import type { HeaderVariableRow } from "./storedHeaders";
import { listEnvKeysFromRows, parseStoredEnvRows } from "./storedEnv";

export type RunCommandTransport = "stdio" | "streamable-http" | "sse";

export type RunCommandArg = {
  id: string;
  name: string;
  enabled: boolean;
  value: string;
};

export type RunCommandProfile = {
  id: string;
  transport: RunCommandTransport;
  command: string;
  url?: string;
  /** Legacy; use `RunCommandsState.sharedArgs`. */
  args: RunCommandArg[];
  isDraft?: boolean;
};

export type RunCommandsState = {
  activeId: string | null;
  commands: RunCommandProfile[];
  /** Flags appended to every active command (stdio, HTTP, SSE). */
  sharedArgs: RunCommandArg[];
};

export const RUN_COMMANDS_CONFIG_KEY = "__runCommands";
export const REGISTRY_KEY_CONFIG_KEY = "__registryKey";

export const TRANSPORT_LABELS: Record<RunCommandTransport, string> = {
  stdio: "stdio",
  "streamable-http": "Streamable HTTP",
  sse: "SSE",
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyRunCommand(transport: RunCommandTransport): RunCommandProfile {
  return {
    id: createId("run"),
    transport,
    command: "",
    url: transport === "stdio" ? undefined : "",
    args: [],
  };
}

export function createEmptyRunCommandArg(): RunCommandArg {
  return {
    id: createId("arg"),
    name: "",
    enabled: true,
    value: "",
  };
}

function migrateSharedArgs(
  commands: RunCommandProfile[],
  sharedArgs: RunCommandArg[] | undefined,
): RunCommandArg[] {
  if (sharedArgs?.length) {
    return sharedArgs;
  }
  const stdio = commands.find((entry) => entry.transport === "stdio");
  if (stdio?.args?.length) {
    return stdio.args;
  }
  for (const profile of commands) {
    if (profile.args?.length) {
      return profile.args;
    }
  }
  return [];
}

function ensureUniqueRunCommandIds(state: RunCommandsState): RunCommandsState {
  const seen = new Set<string>();
  const commands = state.commands.map((entry) => {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      return entry;
    }
    const next = { ...entry, id: createId("run") };
    seen.add(next.id);
    return next;
  });

  let activeId = state.activeId;
  if (activeId && !commands.some((entry) => entry.id === activeId)) {
    activeId = commands[0]?.id ?? null;
  }
  if (!activeId && commands.length === 1) {
    activeId = commands[0]?.id ?? null;
  }

  return { ...state, activeId, commands };
}

export function isRemoteRunTransport(transport: string): boolean {
  return transport === "streamable-http" || transport === "sse";
}

export function getActiveRunCommandProfile(
  state: RunCommandsState,
): RunCommandProfile | null {
  const normalized = normalizeRunCommandsState(state);
  if (normalized.commands.length === 0) {
    return null;
  }
  return (
    normalized.commands.find((entry) => entry.id === normalized.activeId) ??
    normalized.commands[0] ??
    null
  );
}

export function normalizeRunCommandsState(state: RunCommandsState): RunCommandsState {
  const unique = ensureUniqueRunCommandIds(state);
  const commands = unique.commands.map((entry) => ({ ...entry, args: [] }));
  return {
    activeId: unique.activeId,
    commands,
    sharedArgs: migrateSharedArgs(unique.commands, unique.sharedArgs),
  };
}

export function parseRunCommandsState(
  configValues: Record<string, string>,
): RunCommandsState {
  const raw = configValues[RUN_COMMANDS_CONFIG_KEY];
  if (!raw?.trim()) {
    return { activeId: null, commands: [], sharedArgs: [] };
  }
  try {
    const parsed = JSON.parse(raw) as RunCommandsState & {
      commands: RunCommandProfile[];
    };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.commands)) {
      return { activeId: null, commands: [], sharedArgs: [] };
    }
    const commands = parsed.commands.filter(
      (entry) => entry && typeof entry.id === "string" && entry.transport,
    );
    return normalizeRunCommandsState({
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      commands,
      sharedArgs: Array.isArray(parsed.sharedArgs) ? parsed.sharedArgs : [],
    });
  } catch {
    return { activeId: null, commands: [], sharedArgs: [] };
  }
}

function appendEnabledArgsTemplate(parts: string[], args: RunCommandArg[]) {
  for (const arg of args) {
    if (!arg.enabled) {
      continue;
    }
    const name = arg.name.trim();
    if (!name) {
      continue;
    }
    const value = arg.value.trim();
    parts.push(value ? `${name} ${value}`.trim() : name);
  }
}

const MCP_PROTOCOL_VERSION = "2024-11-05";
const MCP_CLIENT_NAME = "tase-deck";
const MCP_CLIENT_VERSION = "0.1.0";

function isSendableHeaderPreview(name: string, value: string): boolean {
  const trimmed = value.trim();
  if (!name.trim() || !trimmed || trimmed.includes("${")) {
    return false;
  }
  if (name.trim().toLowerCase() === "authorization") {
    if (/^bearer$/i.test(trimmed)) {
      return false;
    }
    const bearer = trimmed.match(/^Bearer\s+(.*)$/i);
    if (bearer) {
      return Boolean(bearer[1]?.trim());
    }
  }
  return true;
}

function resolvePreviewHeaders(
  headers: HeaderVariableRow[],
  env: Record<string, string>,
): Array<{ name: string; value: string }> {
  const envRows = parseStoredEnvRows(env);
  const resolved: Array<{ name: string; value: string }> = [];
  for (const row of headers) {
    const name = row.name.trim();
    if (!name) {
      continue;
    }
    const value = resolveEnvTemplate(row.value, env, envRows).trim();
    if (!isSendableHeaderPreview(name, value)) {
      continue;
    }
    resolved.push({ name, value });
  }
  return resolved;
}

/** HTTP request preview for remote MCP transports (initialize). */
export function compileRemoteRequestPreview(
  profile: RunCommandProfile,
  options?: {
    headers?: HeaderVariableRow[];
    env?: Record<string, string>;
  },
): string {
  const env = options?.env ?? {};
  const envRows = parseStoredEnvRows(env);
  const url = resolveEnvTemplate(profile.url ?? "", env, envRows).trim();
  if (!url) {
    return "";
  }

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: MCP_CLIENT_NAME,
        version: MCP_CLIENT_VERSION,
      },
    },
  };

  const headerLines = resolvePreviewHeaders(options?.headers ?? [], env).map(
    ({ name, value }) => `${name}: ${value}`,
  );

  return [
    `POST ${url}`,
    "Content-Type: application/json",
    "Accept: application/json, text/event-stream",
    `MCP-Protocol-Version: ${MCP_PROTOCOL_VERSION}`,
    ...headerLines,
    "",
    JSON.stringify(body, null, 2),
  ].join("\n");
}

/** Preview/storage shell line — `${var}` placeholders are kept. */
export function compileRunCommandTemplate(
  profile: RunCommandProfile,
  sharedArgs: RunCommandArg[] = [],
): string {
  const args = sharedArgs.length > 0 ? sharedArgs : profile.args;

  if (profile.transport === "streamable-http" || profile.transport === "sse") {
    const url = (profile.url ?? "").trim();
    if (!url) {
      return "";
    }
    const parts = [
      profile.transport === "sse" ? `sse ${url}` : `http ${url}`,
    ];
    appendEnabledArgsTemplate(parts, args);
    return parts.join(" ");
  }

  const base = profile.command.trim();
  if (!base) {
    return "";
  }

  const parts = [base];
  appendEnabledArgsTemplate(parts, args);
  return parts.join(" ");
}

function appendEnabledArgs(
  parts: string[],
  args: RunCommandArg[],
  env: Record<string, string>,
  envRows: ReturnType<typeof parseStoredEnvRows>,
) {
  for (const arg of args) {
    if (!arg.enabled) {
      continue;
    }
    const name = resolveEnvTemplate(arg.name, env, envRows).trim();
    if (!name) {
      continue;
    }
    const value = resolveEnvTemplate(arg.value, env, envRows).trim();
    parts.push(value ? `${name} ${value}`.trim() : name);
  }
}

/** Runtime shell line with env values substituted into `${name}` placeholders. */
export function compileRunCommandShell(
  profile: RunCommandProfile,
  env: Record<string, string>,
  envRows?: ReturnType<typeof parseStoredEnvRows>,
  sharedArgs: RunCommandArg[] = [],
): string {
  const rows = envRows ?? parseStoredEnvRows(env);
  const args = sharedArgs.length > 0 ? sharedArgs : profile.args;

  if (profile.transport === "streamable-http" || profile.transport === "sse") {
    const url = resolveEnvTemplate(profile.url ?? "", env, rows).trim();
    if (!url) {
      return "";
    }
    const parts = [
      profile.transport === "sse" ? `sse ${url}` : `http ${url}`,
    ];
    appendEnabledArgs(parts, args, env, rows);
    return parts.join(" ");
  }

  const base = resolveEnvTemplate(profile.command, env, rows).trim();
  if (!base) {
    return "";
  }

  const parts = [base];
  appendEnabledArgs(parts, args, env, rows);
  return parts.join(" ");
}

export function resolveEnvTemplate(
  template: string,
  env: Record<string, string>,
  envRows?: ReturnType<typeof parseStoredEnvRows>,
) {
  const rows = envRows ?? parseStoredEnvRows(env);
  const byName = new Map<string, string>();
  for (const row of rows) {
    const name = row.name.trim();
    if (name) {
      byName.set(name, row.value);
    }
  }
  for (const [key, value] of Object.entries(env)) {
    const name = key.startsWith("env:") ? key.slice(4) : key;
    if (name && !key.startsWith("__")) {
      byName.set(name, value);
    }
  }

  return template.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    return byName.get(name.trim()) ?? "";
  });
}

export function listEnvKeysForAutocomplete(
  env: Record<string, string>,
  envRows?: ReturnType<typeof parseStoredEnvRows>,
) {
  const rows = envRows ?? parseStoredEnvRows(env);
  const fromRows = listEnvKeysFromRows(rows);
  if (fromRows.length > 0) {
    return fromRows;
  }
  const keys = new Set<string>();
  for (const key of Object.keys(env)) {
    if (key.startsWith("__")) {
      continue;
    }
    const name = key.startsWith("env:") ? key.slice(4) : key;
    if (name.trim()) {
      keys.add(name);
    }
  }
  return [...keys].sort();
}

export function extractEnvRefAtCursor(value: string, cursor: number) {
  const before = value.slice(0, cursor);
  const match = before.match(/\$\{([^}]*)$/);
  if (!match) {
    return null;
  }
  return {
    query: match[1] ?? "",
    start: cursor - match[0].length,
    end: cursor,
  };
}

export function isKnownEnvKey(name: string, env: Record<string, string>) {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  const keys = listEnvKeysForAutocomplete(env, parseStoredEnvRows(env));
  return keys.includes(trimmed);
}
