import type {
  McpArgument,
  McpEnvVariable,
  McpInputVariable,
  McpPackage,
  McpRemote,
  McpServer,
  McpServerEntry,
} from "./types";

export type ConfigInput = {
  id: string;
  name: string;
  description?: string;
  isRequired: boolean;
  isSecret: boolean;
  defaultValue?: string;
  placeholder?: string;
  source: "environment" | "argument" | "header" | "remote-variable";
};

export type ParsedLocalSetup = {
  id: string;
  label: string;
  registryType: string;
  transportType: string;
  identifier: string;
  version?: string;
  inputs: ConfigInput[];
  installCommand: string;
  buildRun(values: Record<string, string>): {
    shell: string;
    mcpJson: string;
  };
};

export type ParsedRemoteSetup = {
  id: string;
  label: string;
  transportType: string;
  urlTemplate: string;
  inputs: ConfigInput[];
  buildConnection(values: Record<string, string>): string;
};

export type ParsedServerSetup = {
  serverName: string;
  displayName: string;
  hasLocal: boolean;
  hasRemote: boolean;
  localSetups: ParsedLocalSetup[];
  remoteSetups: ParsedRemoteSetup[];
  rawJson: string;
};

function escapeShell(value: string) {
  return value.replace(/"/g, '\\"');
}

function serverConfigKey(name: string) {
  const slug = name.split("/").pop() ?? name;
  return slug.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
}

function packageVersionRef(pkg: McpPackage) {
  if (!pkg.version || pkg.version === "latest") {
    return pkg.identifier;
  }

  if (pkg.registryType === "pypi") {
    return `${pkg.identifier}==${pkg.version}`;
  }

  return `${pkg.identifier}@${pkg.version}`;
}

function uvxPackageRef(pkg: McpPackage) {
  if (!pkg.version || pkg.version === "latest") {
    return pkg.identifier;
  }

  return `${pkg.identifier}@${pkg.version}`;
}

function defaultRuntimeHint(registryType: string) {
  switch (registryType) {
    case "npm":
      return "npx";
    case "pypi":
      return "uvx";
    case "nuget":
      return "dnx";
    case "oci":
      return "docker";
    default:
      return undefined;
  }
}

function defaultRuntimeArgs(registryType: string, runtimeHint?: string) {
  const hint = runtimeHint ?? defaultRuntimeHint(registryType);

  switch (hint) {
    case "npx":
      return ["-y"];
    case "docker":
      return ["run", "-i", "--rm"];
    default:
      return [];
  }
}

export function environmentVariablesToConfigInputs(
  variables: McpEnvVariable[] | undefined,
): ConfigInput[] {
  return (variables ?? []).map(envInput);
}

function envInput(env: McpEnvVariable): ConfigInput {
  return {
    id: `env:${env.name}`,
    name: env.name,
    description: env.description,
    isRequired: Boolean(env.isRequired),
    isSecret: Boolean(env.isSecret),
    defaultValue: env.default ?? env.value,
    source: "environment",
  };
}

function collectArgumentInputs(
  args: McpArgument[],
  prefix: string,
  inputs: ConfigInput[],
) {
  args.forEach((arg, index) => {
    const path = `${prefix}:${index}`;

    if (arg.variables) {
      for (const [varName, variable] of Object.entries(arg.variables)) {
        inputs.push({
          id: `var:${path}:${varName}`,
          name: varName,
          description: variable.description,
          isRequired: Boolean(variable.isRequired),
          isSecret: Boolean(variable.isSecret),
          defaultValue: variable.default,
          source: "argument",
        });
      }
    }

    if (arg.type === "positional") {
      const key = arg.valueHint ?? `positional-${index}`;
      if (arg.isRequired && !arg.value) {
        inputs.push({
          id: `arg:${path}:${key}`,
          name: key,
          description: arg.description,
          isRequired: true,
          isSecret: Boolean(arg.isSecret),
          defaultValue: arg.default,
          placeholder: arg.placeholder,
          source: "argument",
        });
      }
      return;
    }

    if (arg.type === "named" && arg.isRequired && !arg.value && arg.name) {
      inputs.push({
        id: `arg:${path}:${arg.name}`,
        name: arg.name,
        description: arg.description,
        isRequired: true,
        isSecret: Boolean(arg.isSecret),
        defaultValue: arg.default,
        placeholder: arg.placeholder,
        source: "argument",
      });
    }
  });
}

export function collectPackageConfigInputs(pkg: McpPackage): ConfigInput[] {
  const inputs: ConfigInput[] = [];

  inputs.push(...environmentVariablesToConfigInputs(pkg.environmentVariables));

  collectArgumentInputs(pkg.runtimeArguments ?? [], "runtime", inputs);
  collectArgumentInputs(pkg.packageArguments ?? [], "package", inputs);

  return inputs;
}

function collectPackageInputs(pkg: McpPackage): ConfigInput[] {
  return collectPackageConfigInputs(pkg);
}

function readValue(
  values: Record<string, string>,
  keys: string[],
  fallback?: string,
) {
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined && value !== "") {
      return value;
    }
  }

  return fallback;
}

function substituteTemplate(
  template: string,
  variables: Record<string, McpInputVariable> | undefined,
  values: Record<string, string>,
  path: string,
) {
  return template.replace(/\{([^}]+)\}/g, (_, varName: string) => {
    return (
      readValue(values, [
        `var:${path}:${varName}`,
        varName,
      ]) ??
      variables?.[varName]?.default ??
      `{${varName}}`
    );
  });
}

function resolveArgumentValue(
  arg: McpArgument,
  path: string,
  values: Record<string, string>,
): string | null {
  if (arg.type === "positional") {
    const hint = arg.valueHint ?? path;
    const resolved =
      readValue(values, [`arg:${path}:${hint}`, hint]) ??
      arg.value ??
      arg.default;

    if (!resolved) {
      return arg.isRequired ? `<${hint}>` : null;
    }

    return arg.variables
      ? substituteTemplate(resolved, arg.variables, values, path)
      : resolved;
  }

  const flag = arg.name ?? "";
  if (!flag) {
    return null;
  }

  if (arg.value) {
    const resolved = arg.variables
      ? substituteTemplate(arg.value, arg.variables, values, path)
      : arg.value;

    if (flag.includes("=")) {
      return `${flag.split("=")[0]}=${resolved}`;
    }

    if (resolved.includes("=") && !flag.startsWith("--")) {
      return `${flag}=${resolved}`;
    }

    return `${flag} ${resolved}`.trim();
  }

  const userValue =
    readValue(values, [`arg:${path}:${flag}`, flag]) ?? arg.default;

  if (userValue) {
    return flag.startsWith("--") ? `${flag} ${userValue}` : `--${flag} ${userValue}`;
  }

  if (arg.isRequired) {
    return flag.startsWith("--") ? `${flag} <value>` : `--${flag} <value>`;
  }

  return null;
}

function expandArguments(
  args: McpArgument[],
  prefix: string,
  values: Record<string, string>,
) {
  const tokens: string[] = [];

  args.forEach((arg, index) => {
    const path = `${prefix}:${index}`;
    const resolved = resolveArgumentValue(arg, path, values);

    if (!resolved) {
      return;
    }

    if (arg.type === "named" && resolved.includes(" ") && !resolved.startsWith("--")) {
      tokens.push(resolved);
      return;
    }

    if (arg.type === "named" && resolved.startsWith("--") && resolved.includes(" ")) {
      const [flag, ...rest] = resolved.split(" ");
      tokens.push(flag, rest.join(" "));
      return;
    }

    tokens.push(resolved);
  });

  return tokens;
}

function collectEnvRecord(pkg: McpPackage, values: Record<string, string>) {
  const env: Record<string, string> = {};

  for (const variable of pkg.environmentVariables ?? []) {
    const value =
      readValue(values, [`env:${variable.name}`, variable.name]) ??
      variable.default ??
      variable.value;

    if (value) {
      env[variable.name] = value;
    }
  }

  return env;
}

function buildShellCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
) {
  const envPrefix = Object.entries(env)
    .map(([name, value]) => `${name}="${escapeShell(value)}"`)
    .join(" ");

  const cmd = [command, ...args].join(" ");
  return envPrefix ? `${envPrefix} ${cmd}` : cmd;
}

function buildInstallCommand(pkg: McpPackage) {
  const ref = packageVersionRef(pkg);

  switch (pkg.registryType) {
    case "npm":
      return `npm install -g ${ref}`;
    case "pypi":
      return `pip install ${ref}`;
    case "nuget":
      return `dotnet tool install --global ${pkg.identifier}${pkg.version ? ` --version ${pkg.version}` : ""}`;
    case "oci":
      return `docker pull ${pkg.identifier}`;
    case "mcpb":
      return `curl -L -o "$(basename "${pkg.identifier}")" "${pkg.identifier}"`;
    default:
      return `# Install via ${pkg.registryType}: ${ref}`;
  }
}

function buildRunCommandParts(pkg: McpPackage, values: Record<string, string>) {
  const runtimeHint = pkg.runtimeHint ?? defaultRuntimeHint(pkg.registryType) ?? pkg.identifier;
  const runtimeArgs = expandArguments(pkg.runtimeArguments ?? [], "runtime", values);
  const packageArgs = expandArguments(pkg.packageArguments ?? [], "package", values);
  const env = collectEnvRecord(pkg, values);

  if (pkg.transport?.type && pkg.transport.type !== "stdio" && pkg.transport.url) {
    const url = substituteTransportUrl(pkg, values);
    const key = "local";
    const mcpJson = JSON.stringify(
      {
        mcpServers: {
          [key]: {
            url,
            type: pkg.transport.type,
          },
        },
      },
      null,
      2,
    );

    return {
      command: runtimeHint,
      args: [],
      env,
      shell: buildShellCommand(runtimeHint, [url], env),
      mcpJson,
    };
  }

  let command = runtimeHint;
  let args = [...defaultRuntimeArgs(pkg.registryType, pkg.runtimeHint), ...runtimeArgs];

  if (pkg.registryType === "npm" || runtimeHint === "npx") {
    command = "npx";
    if (!args.includes("-y")) {
      args = ["-y", ...args.filter((arg) => arg !== "-y")];
    }
    args.push(packageVersionRef(pkg), ...packageArgs);
  } else if (pkg.registryType === "pypi" || runtimeHint === "uvx") {
    command = "uvx";
    args.push(uvxPackageRef(pkg), ...packageArgs);
  } else if (pkg.registryType === "nuget" || runtimeHint === "dnx") {
    command = "dnx";
    args.push(packageVersionRef(pkg));
    if (packageArgs.length > 0) {
      args.push("--", ...packageArgs);
    }
  } else if (pkg.registryType === "oci" || runtimeHint === "docker") {
    command = "docker";
    if (args.length === 0) {
      args = ["run", "-i", "--rm"];
    }
    args.push(pkg.identifier, ...packageArgs);
  } else {
    args.push(packageVersionRef(pkg), ...packageArgs);
  }

  args = args.filter(Boolean);

  const shell = buildShellCommand(command, args, env);
  const key = serverConfigKey(pkg.identifier);
  const serverConfig: Record<string, unknown> = {
    command,
    args,
  };

  if (Object.keys(env).length > 0) {
    serverConfig.env = env;
  }

  const mcpJson = JSON.stringify({ mcpServers: { [key]: serverConfig } }, null, 2);

  return { command, args, env, shell, mcpJson };
}

function substituteTransportUrl(pkg: McpPackage, values: Record<string, string>) {
  const template = pkg.transport?.url ?? "";
  const envNames = new Set((pkg.environmentVariables ?? []).map((item) => item.name));

  return template.replace(/\{([^}]+)\}/g, (_, token: string) => {
    return (
      readValue(values, [`env:${token}`, token]) ??
      readValue(
        values,
        (pkg.packageArguments ?? [])
          .map((_, index) => `arg:package:${index}:${token}`)
          .concat((pkg.runtimeArguments ?? []).map((_, index) => `arg:runtime:${index}:${token}`)),
      ) ??
      (envNames.has(token) ? `{${token}}` : `{${token}}`)
    );
  });
}

function parseLocalPackage(pkg: McpPackage, index: number): ParsedLocalSetup {
  const transportType = pkg.transport?.type ?? "stdio";
  const label =
    transportType === "stdio"
      ? `${pkg.registryType} · ${pkg.identifier}`
      : `${pkg.registryType} · ${transportType}`;

  return {
    id: `local-${index}`,
    label,
    registryType: pkg.registryType,
    transportType,
    identifier: pkg.identifier,
    version: pkg.version,
    inputs: collectPackageInputs(pkg),
    installCommand: buildInstallCommand(pkg),
    buildRun(values) {
      const run = buildRunCommandParts(pkg, values);
      return {
        shell: run.shell,
        mcpJson: run.mcpJson,
      };
    },
  };
}

function collectRemoteInputs(remote: McpRemote, index: number): ConfigInput[] {
  const inputs: ConfigInput[] = [];

  for (const header of remote.headers ?? []) {
    const name = header.name?.trim();
    if (!name) {
      continue;
    }
    inputs.push({
      id: `header:${name}`,
      name,
      description: header.description,
      isRequired: Boolean(header.isRequired),
      isSecret: Boolean(header.isSecret),
      defaultValue: header.value,
      source: "header",
    });
  }

  for (const [name, variable] of Object.entries(remote.variables ?? {})) {
    if (variable.isRequired) {
      inputs.push({
        id: `remote-var:${index}:${name}`,
        name,
        description: variable.description,
        isRequired: true,
        isSecret: Boolean(variable.isSecret),
        defaultValue: variable.default,
        source: "remote-variable",
      });
    }
  }

  return inputs;
}

function resolveRemoteUrl(
  remote: McpRemote,
  index: number,
  values: Record<string, string>,
) {
  return (remote.url ?? "").replace(/\{([^}]+)\}/g, (_, token: string) => {
    return (
      readValue(values, [
        `remote-var:${index}:${token}`,
        `header:${index}:${token}`,
        token,
      ]) ?? `{${token}}`
    );
  });
}

function parseRemote(remote: McpRemote, index: number, serverName: string): ParsedRemoteSetup {
  const key = serverConfigKey(serverName);

  return {
    id: `remote-${index}`,
    label: remote.type,
    transportType: remote.type,
    urlTemplate: remote.url,
    inputs: collectRemoteInputs(remote, index),
    buildConnection(values) {
      const url = resolveRemoteUrl(remote, index, values);
      const headers: Record<string, string> = {};

      for (const header of remote.headers ?? []) {
        const value =
          readValue(values, [`header:${index}:${header.name}`, header.name]) ??
          header.value;

        if (value) {
          headers[header.name] = substituteTemplate(
            value,
            undefined,
            values,
            `header:${index}:${header.name}`,
          );
        }
      }

      const config: Record<string, unknown> = { url };

      if (remote.type) {
        config.type = remote.type;
      }

      if (Object.keys(headers).length > 0) {
        config.headers = headers;
      }

      return JSON.stringify({ mcpServers: { [key]: config } }, null, 2);
    },
  };
}

const serverSetupCache = new WeakMap<McpServerEntry, ParsedServerSetup>();

export function parseServerSetup(entry: McpServerEntry): ParsedServerSetup {
  const cached = serverSetupCache.get(entry);
  if (cached) {
    return cached;
  }

  const { server } = entry;
  const localSetups = (server.packages ?? []).map(parseLocalPackage);
  const remoteSetups = (server.remotes ?? []).map((remote, index) =>
    parseRemote(remote, index, server.name),
  );

  const setup: ParsedServerSetup = {
    serverName: server.name,
    displayName: server.title ?? server.name,
    hasLocal: localSetups.length > 0,
    hasRemote: remoteSetups.length > 0,
    localSetups,
    remoteSetups,
    rawJson: JSON.stringify(entry, null, 2),
  };
  serverSetupCache.set(entry, setup);
  return setup;
}

export function hasLocalPackages(server: Pick<McpServer, "packages">) {
  return (server.packages?.length ?? 0) > 0;
}

export function hasRemoteConnections(server: Pick<McpServer, "remotes">) {
  return (server.remotes?.length ?? 0) > 0;
}

export function getRequiredInputs(setup: ParsedLocalSetup | ParsedRemoteSetup) {
  return setup.inputs.filter((input) => input.isRequired);
}

export function getRequiredConfigInputs(inputs: ConfigInput[]) {
  return inputs.filter((input) => input.isRequired);
}

type McpJsonServerEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: string;
  headers?: Record<string, string>;
};

function defaultMcpServerKey(serverName: string) {
  const slug = serverName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "mcp-server";
}

export function rebuildInstalledMcpConfig(
  inputs: ConfigInput[],
  values: Record<string, string>,
  jsonConfig: string,
  serverName = "mcp-server",
): { jsonConfig: string; runCommand: string } {
  let parsed: { mcpServers?: Record<string, McpJsonServerEntry> };
  try {
    parsed = JSON.parse(jsonConfig || "{}") as {
      mcpServers?: Record<string, McpJsonServerEntry>;
    };
  } catch {
    parsed = {};
  }

  const servers = { ...(parsed.mcpServers ?? {}) };
  let key = Object.keys(servers)[0];
  if (!key) {
    key = defaultMcpServerKey(serverName);
    servers[key] = { command: "", args: [], env: {} };
  }

  const entry: McpJsonServerEntry = { ...(servers[key] ?? {}) };
  if (entry.url) {
    const headers: Record<string, string> = {};
    const rawHeaders = values.__headers;
    if (rawHeaders?.trim()) {
      try {
        const parsed = JSON.parse(rawHeaders) as Array<{ name?: string; value?: string }>;
        if (Array.isArray(parsed)) {
          for (const row of parsed) {
            const rawName = row.name?.trim();
            if (!rawName) {
              continue;
            }
            const legacy = rawName.match(/^(\d+):(.+)$/);
            const name = legacy?.[2]?.trim() || rawName;
            headers[name] = row.value ?? "";
          }
        }
      } catch {
        /* fall through */
      }
    }
    for (const [configKey, configValue] of Object.entries(values)) {
      if (!configKey.startsWith("header:")) {
        continue;
      }
      const rest = configKey.slice("header:".length);
      const legacy = rest.match(/^(\d+):(.+)$/);
      const name = (legacy?.[2] ?? rest).trim();
      if (name && !(name in headers)) {
        headers[name] = configValue;
      }
    }
    if (Object.keys(headers).length > 0) {
      entry.headers = headers;
    } else {
      delete entry.headers;
    }
    const nextJson = JSON.stringify({ mcpServers: { [key]: entry } }, null, 2);
    return { jsonConfig: nextJson, runCommand: "" };
  }

  const env: Record<string, string> = { ...(entry.env ?? {}) };
  for (const input of inputs) {
    if (input.source !== "environment") {
      continue;
    }
    const value = readValue(values, [input.id, input.name])?.trim() ?? "";
    if (value) {
      env[input.name] = value;
    } else {
      delete env[input.name];
    }
  }

  if (Object.keys(env).length > 0) {
    entry.env = env;
  } else {
    delete entry.env;
  }

  const command = entry.command ?? "";
  const args = entry.args ?? [];
  const nextJson = JSON.stringify({ mcpServers: { [key]: entry } }, null, 2);
  const runCommand = command ? buildShellCommand(command, args, env) : "";

  return { jsonConfig: nextJson, runCommand };
}
