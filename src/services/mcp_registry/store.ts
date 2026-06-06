import type { McpSourceId } from "./types";

export type McpRegistryUiState = {
  source: McpSourceId;
  query: string;
};

const DEFAULT_STATE: McpRegistryUiState = {
  source: "all",
  query: "",
};

let uiState: McpRegistryUiState = { ...DEFAULT_STATE };

export function getMcpRegistryUiState(): McpRegistryUiState {
  return uiState;
}

export function patchMcpRegistryUiState(
  patch: Partial<McpRegistryUiState>,
): McpRegistryUiState {
  uiState = { ...uiState, ...patch };
  return uiState;
}
