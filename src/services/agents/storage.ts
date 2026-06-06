import { agentLabel } from "./constants";
import type { AgentKind, ConfiguredAgent } from "./types";

const STORAGE_KEY = "tasedeck:configured-agents";

function loadAgents(): ConfiguredAgent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as ConfiguredAgent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getStoredAgents(): ConfiguredAgent[] {
  return loadAgents();
}

export function saveAgents(agents: ConfiguredAgent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

export function createConfiguredAgent(kind: AgentKind): ConfiguredAgent {
  return {
    id: crypto.randomUUID(),
    kind,
    name: agentLabel(kind),
    createdAt: new Date().toISOString(),
  };
}
