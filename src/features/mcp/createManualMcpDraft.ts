import type { InstalledMcpServer } from "../../services/mcp_installed";

export function createManualMcpDraft(): InstalledMcpServer {
  return {
    id: 0,
    name: "",
    type: "local",
    path: "manual/local",
    runCommand: "",
    jsonConfig: "{}",
    configInputs: "[]",
    configValues: "{}",
    description: "",
    createdAt: "",
    updatedAt: "",
  };
}
