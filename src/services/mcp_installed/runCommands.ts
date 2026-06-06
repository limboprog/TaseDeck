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

export function normalizeRunCommandsState(state: RunCommandsState): RunCommandsState {
  const commands = state.commands.map((entry) => ({ ...entry, args: [] }));
  return {
    activeId: state.activeId,
    commands,
    sharedArgs: migrateSharedArgs(state.commands, state.sharedArgs),
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
    const name = arg.name.trim();
    if (!name) {
      continue;
    }
    const value = resolveEnvTemplate(arg.value, env, envRows).trim();
    parts.push(value ? `${name} ${value}`.trim() : name);
  }
}

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
