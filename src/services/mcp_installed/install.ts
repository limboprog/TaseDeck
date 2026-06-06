import type { McpServerEntry } from "../mcp_registry";
import {
  getRequiredConfigInputs,
  parseServerSetup,
  type ParsedLocalSetup,
} from "../mcp_registry/parser";
import { addRegistryMcpServer, installLocalMcpServer } from "./api";
import { buildRegistryRunCommandsState } from "./installRunCommands";
import { resolveInstallConfigInputs } from "./installPayloadHelpers";
import { RUN_COMMANDS_CONFIG_KEY } from "./runCommands";
import type { InstallMcpLocalRequest, InstalledMcpServer } from "./types";
import { notifyMcpInstalled } from "./types";

export { createDefaultInputValues } from "./installPayloadHelpers";

export function getPrimaryLocalSetup(entry: McpServerEntry) {
  const setup = parseServerSetup(entry);
  return setup.localSetups[0] ?? null;
}

export function validateRequiredInputValues(
  localSetup: ParsedLocalSetup,
  values: Record<string, string>,
) {
  for (const input of getRequiredConfigInputs(localSetup.inputs)) {
    const value = values[input.id]?.trim() ?? "";
    if (!value) {
      return `Fill in ${input.name} in the server settings before installing.`;
    }
  }
  return null;
}

export function buildInstallRequest(
  entry: McpServerEntry,
  localSetup: ParsedLocalSetup,
  values: Record<string, string>,
): InstallMcpLocalRequest {
  const configInputs = resolveInstallConfigInputs(entry, localSetup);
  const run = localSetup.buildRun(values);
  const { server } = entry;

  const runCommands = buildRegistryRunCommandsState(entry, localSetup, values);

  return {
    installCommand: localSetup.installCommand,
    server: {
      id: 0,
      name: server.title ?? server.name,
      type: "local",
      path: localSetup.identifier,
      runCommand: run.shell,
      jsonConfig: run.mcpJson,
      configInputs: JSON.stringify(configInputs),
      configValues: JSON.stringify({
        ...values,
        [RUN_COMMANDS_CONFIG_KEY]: JSON.stringify(runCommands),
      }),
      description:
        server.description?.trim() ||
        "Installed MCP server for agent tools and integrations.",
      createdAt: "",
      updatedAt: "",
    },
  };
}

export async function installRegistryLocalServer(
  entry: McpServerEntry,
  values: Record<string, string>,
) {
  const localSetup = getPrimaryLocalSetup(entry);
  if (!localSetup) {
    throw new Error("This server has no local install package.");
  }

  const request = buildInstallRequest(entry, localSetup, values);
  const installed = await installLocalMcpServer(request);
  notifyMcpInstalled(installed);
  return installed;
}

function scheduleInstalledNotify(server: InstalledMcpServer) {
  const notify = () => notifyMcpInstalled(server);
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(notify, { timeout: 120 });
    return;
  }
  window.setTimeout(notify, 0);
}

/** Adds registry server via Tauri backend (config build + install). */
export async function addRegistryServer(entry: McpServerEntry) {
  const installed = await addRegistryMcpServer(entry);
  scheduleInstalledNotify(installed);
  return installed;
}

export type { InstalledMcpServer };
