/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MCP_API_BASE?: string;
  readonly VITE_MCP_REGISTRY_URL?: string;
  /** Set to "true" to use the local backend catalog instead of the official MCP registry. */
  readonly VITE_USE_MCP_BACKEND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
