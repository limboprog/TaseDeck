import { fetchCatalogPage } from "./registryFetch";
import type { McpListParams, McpListResult, McpSourceId } from "./types";

export async function fetchRegistryServers(
  params: McpListParams & { source?: McpSourceId },
): Promise<McpListResult> {
  return fetchCatalogPage(params);
}
