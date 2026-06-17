import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type McpAuthChallenge = {
  serverId: number;
  serverName: string;
  endpoint: string;
  flow: string;
  authorizationUrl?: string | null;
  resourceMetadataUrl?: string | null;
};

export type McpOAuthSignInComplete = {
  serverId: number;
};

const AUTH_REQUIRED_PREFIX = "MCP_AUTH_REQUIRED:";
export const MCP_OAUTH_SIGN_IN_EVENT = "mcp-oauth-sign-in-required";
export const MCP_OAUTH_SIGN_IN_COMPLETE_EVENT = "mcp-oauth-sign-in-complete";

export function parseAuthRequiredError(
  message: string | null | undefined,
): McpAuthChallenge | null {
  if (!message) {
    return null;
  }
  const markerIndex = message.indexOf(AUTH_REQUIRED_PREFIX);
  if (markerIndex < 0) {
    return null;
  }
  try {
    return JSON.parse(
      message.slice(markerIndex + AUTH_REQUIRED_PREFIX.length),
    ) as McpAuthChallenge;
  } catch {
    return null;
  }
}

export function listenMcpOAuthSignInRequired(
  serverId: number,
  onChallenge: (challenge: McpAuthChallenge) => void,
): Promise<UnlistenFn> {
  return listen<McpAuthChallenge>(MCP_OAUTH_SIGN_IN_EVENT, (event) => {
    if (event.payload.serverId === serverId) {
      onChallenge(event.payload);
    }
  });
}

export function listenMcpOAuthSignInComplete(
  serverId: number,
  onComplete: (payload: McpOAuthSignInComplete) => void,
): Promise<UnlistenFn> {
  return listen<McpOAuthSignInComplete>(MCP_OAUTH_SIGN_IN_COMPLETE_EVENT, (event) => {
    if (event.payload.serverId === serverId) {
      onComplete(event.payload);
    }
  });
}

export async function startMcpOAuthSignIn(serverId: number): Promise<void> {
  await invoke("mcp_oauth_start_sign_in", { serverId });
}

export async function setMcpApiKey(serverId: number, apiKey: string): Promise<void> {
  await invoke("mcp_oauth_set_api_key", { serverId, apiKey });
}
