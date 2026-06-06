import { invoke } from "@tauri-apps/api/core";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Same-origin proxy path (Vite dev) when not running inside Tauri. */
const DEV_REGISTRY_PREFIX = "/mcp-registry";

export function resolveRegistryUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  if (isTauriRuntime()) {
    const base =
      import.meta.env.VITE_MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io";
    return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  }

  return `${DEV_REGISTRY_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function httpGetJson(url: string): Promise<unknown> {
  if (isTauriRuntime()) {
    return invoke<unknown>("registry_http_get", { url });
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Registry request failed (${response.status})`);
  }

  return response.json();
}
