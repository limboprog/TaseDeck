import type { McpServerEntry } from "../mcp_registry";
import type { McpPackage } from "../mcp_registry/types";
import type { ParsedLocalSetup } from "../mcp_registry/parser";
import {
  createEmptyRunCommand,
  type RunCommandsState,
} from "./runCommands";

function packageRef(pkg: McpPackage) {
  if (!pkg.version || pkg.version === "latest") {
    return pkg.identifier;
  }
  return `${pkg.identifier}@${pkg.version}`;
}

function buildNpmExecShell(pkg: McpPackage) {
  const ref = packageRef(pkg);
  return `npm exec --yes --package=${ref} -- ${ref}`;
}

export function buildRegistryRunCommandsState(
  entry: McpServerEntry,
  localSetup: ParsedLocalSetup,
  values: Record<string, string>,
): RunCommandsState {
  const primaryShell = localSetup.buildRun(values).shell;
  const primary = createEmptyRunCommand("stdio");
  primary.command = primaryShell;

  const commands = [primary];
  const pkg = entry.server.packages?.[0];

  if (pkg?.registryType === "npm") {
    const npmShell = buildNpmExecShell(pkg);
    if (npmShell !== primaryShell) {
      const npmProfile = createEmptyRunCommand("stdio");
      npmProfile.command = npmShell;
      commands.push(npmProfile);
    }
  }

  return {
    activeId: primary.id,
    commands,
    sharedArgs: [],
  };
}
