import {
  createEmptyRunCommand,
  createEmptyRunCommandArg,
  normalizeRunCommandsState,
  type RunCommandArg,
  type RunCommandsState,
  type RunCommandTransport,
} from "./runCommands";

type McpJsonServerEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, unknown>;
  url?: string;
  type?: string;
  headers?: Record<string, unknown>;
};

function firstMcpJsonEntry(jsonConfig: string): McpJsonServerEntry | null {
  if (!jsonConfig.trim() || jsonConfig.trim() === "{}") {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonConfig) as {
      mcpServers?: Record<string, McpJsonServerEntry>;
    };
    const entry = Object.values(parsed.mcpServers ?? {})[0];
    return entry ?? null;
  } catch {
    return null;
  }
}

function normalizeTransportType(type?: string): RunCommandTransport | null {
  if (!type?.trim()) {
    return null;
  }
  const normalized = type.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "sse") {
    return "sse";
  }
  if (
    normalized === "http" ||
    normalized === "streamable-http" ||
    normalized === "streamable"
  ) {
    return "streamable-http";
  }
  if (normalized === "stdio") {
    return "stdio";
  }
  return null;
}

function collectPlaceholderKeys(text: string, keys: Set<string>) {
  for (const match of text.matchAll(/\$\{([^}]+)\}/g)) {
    const name = match[1]?.trim();
    if (name) {
      keys.add(name);
    }
  }
  for (const match of text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    const name = match[1]?.trim();
    if (name) {
      keys.add(name);
    }
  }
}

export function collectEnvKeysFromJson(jsonConfig: string): string[] {
  const entry = firstMcpJsonEntry(jsonConfig);
  if (!entry) {
    return [];
  }

  const keys = new Set<string>();

  for (const name of Object.keys(entry.env ?? {})) {
    const trimmed = name.trim();
    if (trimmed) {
      keys.add(trimmed);
    }
  }

  if (entry.url) {
    collectPlaceholderKeys(entry.url, keys);
  }
  if (entry.command) {
    collectPlaceholderKeys(entry.command, keys);
  }
  for (const arg of entry.args ?? []) {
    collectPlaceholderKeys(arg, keys);
  }
  for (const [headerName, headerValue] of Object.entries(entry.headers ?? {})) {
    collectPlaceholderKeys(headerName, keys);
    if (typeof headerValue === "string") {
      collectPlaceholderKeys(headerValue, keys);
    }
  }

  return [...keys].sort();
}

export function inferRunCommandsFromJson(jsonConfig: string): RunCommandsState | null {
  const entry = firstMcpJsonEntry(jsonConfig);
  if (!entry) {
    return null;
  }

  const url = entry.url?.trim();
  if (url) {
    const transport = normalizeTransportType(entry.type) ?? "streamable-http";
    const profile = createEmptyRunCommand(transport);
    profile.url = url;
    return normalizeRunCommandsState({
      activeId: profile.id,
      commands: [profile],
      sharedArgs: [],
    });
  }

  const command = entry.command?.trim() ?? "";
  if (!command) {
    return null;
  }

  const profile = createEmptyRunCommand("stdio");
  profile.command = command;
  const sharedArgs: RunCommandArg[] = (entry.args ?? [])
    .map((arg) => arg.trim())
    .filter(Boolean)
    .map((arg) => ({
      ...createEmptyRunCommandArg(),
      name: arg,
      enabled: true,
    }));

  return normalizeRunCommandsState({
    activeId: profile.id,
    commands: [profile],
    sharedArgs,
  });
}

export function inferRunCommandsFromShell(runCommand: string): RunCommandsState | null {
  const shell = runCommand.trim();
  if (!shell) {
    return null;
  }

  if (shell.startsWith("http ")) {
    const profile = createEmptyRunCommand("streamable-http");
    profile.url = shell.slice(5).trim();
    return normalizeRunCommandsState({
      activeId: profile.id,
      commands: [profile],
      sharedArgs: [],
    });
  }

  if (shell.startsWith("sse ")) {
    const profile = createEmptyRunCommand("sse");
    profile.url = shell.slice(4).trim();
    return normalizeRunCommandsState({
      activeId: profile.id,
      commands: [profile],
      sharedArgs: [],
    });
  }

  return null;
}
