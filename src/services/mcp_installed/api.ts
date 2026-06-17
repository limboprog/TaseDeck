import { invoke } from "@tauri-apps/api/core";
import type { McpServerEntry } from "../mcp_registry";
import { normalizeInstalledMcpServer } from "./normalize";
import type {
  InstallMcpLocalRequest,
  InstalledMcpServer,
  McpServerAnalysis,
} from "./types";
import { notifyMcpRemoved } from "./types";

export function listInstalledMcpServers() {
  return invoke<InstalledMcpServer[]>("mcp_list_servers").then((servers) =>
    servers.map(normalizeInstalledMcpServer),
  );
}

export function installLocalMcpServer(request: InstallMcpLocalRequest) {
  return invoke<InstalledMcpServer>("mcp_install_local", { request }).then(
    normalizeInstalledMcpServer,
  );
}

export function addInstalledMcpServer(server: InstalledMcpServer) {
  return invoke<InstalledMcpServer>("mcp_add_server", { server }).then(
    normalizeInstalledMcpServer,
  );
}

export function addRegistryMcpServer(entry: McpServerEntry) {
  return invoke<InstalledMcpServer>("mcp_add_from_registry", { entry }).then(
    normalizeInstalledMcpServer,
  );
}

export function updateInstalledMcpServer(server: InstalledMcpServer) {
  return invoke<InstalledMcpServer>("mcp_update_server", { server }).then(
    normalizeInstalledMcpServer,
  );
}

export async function removeInstalledMcpServer(id: number) {
  const removed = await invoke<boolean>("mcp_remove_server", { serverId: id });
  if (!removed) {
    throw new Error("MCP server was not found");
  }
  notifyMcpRemoved(id);
  return true;
}

/** Builds stored `run_command` on the backend: active command + args, `${var}` preserved. */
export function compileMcpRunCommand(configValues: Record<string, string>) {
  return invoke<string>("mcp_compile_run_command", {
    configValues: JSON.stringify(configValues),
  });
}

/** Parses json config, run commands, env rows, and compiled command template on the backend. */
export function analyzeMcpServer(server: InstalledMcpServer) {
  return invoke<McpServerAnalysis>("mcp_analyze_server", {
    server: {
      id: server.id,
      name: server.name,
      type: server.type,
      path: server.path,
      runCommand: server.runCommand,
      jsonConfig: server.jsonConfig,
      configInputs: server.configInputs,
      configValues: server.configValues,
      description: server.description,
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
    },
  });
}
