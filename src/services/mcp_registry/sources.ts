import { fetchRegistryServers } from "./api";
import type {
  McpListProvider,
  McpSourceId,
} from "./types";

export const registrySource: McpListProvider = {
  id: "all",
  label: "All",
  supportsRemoteSearch: true,
  list: fetchRegistryServers,
};

export const localSource: McpListProvider = {
  id: "local",
  label: "Local",
  supportsRemoteSearch: true,
  list: fetchRegistryServers,
};

export const remoteSource: McpListProvider = {
  id: "remote",
  label: "Remote",
  supportsRemoteSearch: true,
  list: fetchRegistryServers,
};

export const MCP_SOURCES: Record<McpSourceId, McpListProvider> = {
  all: registrySource,
  local: localSource,
  remote: remoteSource,
};

export const MCP_SOURCE_ORDER: McpSourceId[] = ["all", "local", "remote"];

export function getMcpSource(id: McpSourceId): McpListProvider {
  return MCP_SOURCES[id];
}
