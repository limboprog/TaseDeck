import type {
  InstalledMcpServer,
  McpEnvVariableRow,
  McpHeaderVariableRow,
  McpServerAnalysis,
  McpServerType,
} from "./types";
import type { RunCommandsState } from "./runCommands";
import type { ConfigInput } from "../mcp_registry/parser";

function readString(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}

function normalizeRunCommands(raw: unknown): RunCommandsState {
  const record = (raw ?? {}) as RunCommandsState & Record<string, unknown>;
  const commands = Array.isArray(record.commands) ? record.commands : [];
  const sharedArgs = Array.isArray(record.sharedArgs) ? record.sharedArgs : [];
  const activeId =
    typeof record.activeId === "string"
      ? record.activeId
      : commands[0]?.id ?? null;
  return { activeId, commands, sharedArgs };
}

function normalizeAnalysis(raw: unknown): McpServerAnalysis | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  return {
    runCommands: normalizeRunCommands(record.runCommands),
    configInputs: Array.isArray(record.configInputs)
      ? (record.configInputs as ConfigInput[])
      : [],
    envVariables: Array.isArray(record.envVariables)
      ? (record.envVariables as McpEnvVariableRow[])
      : [],
    headerVariables: Array.isArray(record.headerVariables)
      ? (record.headerVariables as McpHeaderVariableRow[])
      : [],
    compiledCommandTemplate:
      typeof record.compiledCommandTemplate === "string"
        ? record.compiledCommandTemplate
        : "",
  };
}

export function normalizeInstalledMcpServer(raw: InstalledMcpServer): InstalledMcpServer {
  const record = raw as InstalledMcpServer & Record<string, unknown>;

  return {
    id: Number(record.id ?? 0),
    name: String(record.name ?? ""),
    type: (record.type ?? "local") as McpServerType,
    path: (record.path as string | null | undefined) ?? null,
    runCommand: readString(record, "runCommand", "run_command"),
    jsonConfig: readString(record, "jsonConfig", "json_config") || "{}",
    configInputs: readString(record, "configInputs", "config_inputs") || "[]",
    configValues: readString(record, "configValues", "config_values") || "{}",
    description: readString(record, "description"),
    createdAt: readString(record, "createdAt", "created_at"),
    updatedAt: readString(record, "updatedAt", "updated_at"),
    analysis: normalizeAnalysis(record.analysis),
  };
}
