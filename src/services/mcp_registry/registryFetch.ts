import { httpGetJson, resolveRegistryUrl } from "./registryHttp";
import type { McpListParams, McpListResult, McpServerEntry } from "./types";

/** Backend catalog is kept in the repo but off by default — set `VITE_USE_MCP_BACKEND=true` to enable. */
export const USE_MCP_BACKEND = import.meta.env.VITE_USE_MCP_BACKEND === "true";

const API_BASE = import.meta.env.VITE_MCP_API_BASE ?? "http://localhost:8080";
const META_KEY = "io.modelcontextprotocol.registry/official";

type RegistryApiItem = {
  server: McpServerEntry["server"];
  _meta?: Record<string, McpServerEntry["meta"]>;
};

function normalizeRegistryItem(item: RegistryApiItem): McpServerEntry {
  return {
    server: item.server,
    meta: item._meta?.[META_KEY] ?? {},
  };
}

async function fetchRegistryApiPage(params: {
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ servers: McpServerEntry[]; nextCursor?: string }> {
  const url = new URL(resolveRegistryUrl("/v0/servers"));
  url.searchParams.set("limit", String(params.limit ?? 30));
  url.searchParams.set("version", "latest");

  if (params.cursor) {
    url.searchParams.set("cursor", params.cursor);
  }

  if (params.search?.trim()) {
    url.searchParams.set("search", params.search.trim());
  }

  const data = (await httpGetJson(url.toString())) as {
    servers?: RegistryApiItem[];
    metadata?: { nextCursor?: string };
  };

  return {
    servers: (data.servers ?? []).map(normalizeRegistryItem),
    nextCursor: data.metadata?.nextCursor,
  };
}

async function fetchCatalogFromRegistry(params: McpListParams): Promise<McpListResult> {
  const page = await fetchRegistryApiPage({
    search: params.search,
    cursor: params.cursor,
    limit: params.limit ?? 30,
  });

  return {
    servers: page.servers,
    nextCursor: page.nextCursor,
    count: page.servers.length,
  };
}

async function fetchCatalogFromBackend(
  params: McpListParams & { source?: string },
): Promise<McpListResult> {
  const url = new URL(`${API_BASE}/api/v1/mcp/servers`);
  const limit = params.limit ?? 30;

  url.searchParams.set("limit", String(limit));
  url.searchParams.set("source", params.source ?? "all");

  if (params.cursor) {
    url.searchParams.set("cursor", params.cursor);
  }

  if (params.search?.trim()) {
    url.searchParams.set("search", params.search.trim());
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Catalog request failed (${response.status})`);
  }

  const data = (await response.json()) as {
    servers: McpServerEntry[];
    metadata?: { count?: number; nextCursor?: string };
  };

  return {
    servers: data.servers,
    nextCursor: data.metadata?.nextCursor,
    count: data.metadata?.count ?? data.servers.length,
  };
}

export async function fetchCatalogPage(
  params: McpListParams & { source?: string },
): Promise<McpListResult> {
  if (USE_MCP_BACKEND) {
    return fetchCatalogFromBackend(params);
  }

  return fetchCatalogFromRegistry(params);
}
