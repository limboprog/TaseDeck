const authPromptServerIds = new Set<number>();

export function enableMcpAuthPrompt(serverId: number) {
  if (serverId > 0) {
    authPromptServerIds.add(serverId);
  }
}

export function isMcpAuthPromptEnabled(serverId: number) {
  return serverId > 0 && authPromptServerIds.has(serverId);
}

export function disableMcpAuthPrompt(serverId: number) {
  authPromptServerIds.delete(serverId);
}
