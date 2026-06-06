export type AgentKind = "cursor" | "claude-code" | "antigravity" | "copilot";

export type AgentCatalogEntry = {
  kind: AgentKind;
  label: string;
};

export type McpConfigLocation = {
  configDir: string;
  mcpJsonPath: string;
  dirExists: boolean;
  mcpJsonExists: boolean;
};

export type AgentConfigInfo = {
  kind: AgentKind;
  label: string;
  candidates: McpConfigLocation[];
  active: McpConfigLocation | null;
};

export type ConfiguredAgent = {
  id: string;
  kind: AgentKind;
  name: string;
  createdAt: string;
};
