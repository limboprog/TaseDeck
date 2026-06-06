import type { InstalledMcpServer, McpServerType } from "./types";

function readString(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
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
  };
}
