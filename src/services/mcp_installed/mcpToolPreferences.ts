const STORAGE_PREFIX = "tasedeck-mcp-tools:";

function storageKey(serverId: number) {
  return `${STORAGE_PREFIX}${serverId}`;
}

function loadMap(serverId: number): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(storageKey(serverId));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const map: Record<string, boolean> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") {
        map[name] = value;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function isMcpToolEnabled(serverId: number, toolName: string) {
  const map = loadMap(serverId);
  return map[toolName] !== false;
}

export function setMcpToolEnabled(serverId: number, toolName: string, enabled: boolean) {
  const map = loadMap(serverId);
  map[toolName] = enabled;
  localStorage.setItem(storageKey(serverId), JSON.stringify(map));
}

export function loadMcpToolEnabledMap(serverId: number) {
  return loadMap(serverId);
}

export function replaceMcpToolEnabledMap(serverId: number, map: Record<string, boolean>) {
  localStorage.setItem(storageKey(serverId), JSON.stringify(map));
}
