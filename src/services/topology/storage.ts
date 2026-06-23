import { normalizeTopology } from "./normalize";
import type { Topology } from "./types";

const STORAGE_KEY = "tasedeck:topologies";

export const TOPOLOGIES_CHANGED_EVENT = "topologies-changed";

export function notifyTopologiesChanged() {
  window.dispatchEvent(new CustomEvent(TOPOLOGIES_CHANGED_EVENT));
}

export function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadTopologies(): Topology[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Topology[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((topology) =>
      normalizeTopology({
        ...topology,
        blocks: topology.blocks ?? [],
      }),
    );
  } catch {
    return [];
  }
}

export function saveTopologies(topologies: Topology[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(topologies));
  notifyTopologiesChanged();
}

export function getStoredTopologies(): Topology[] {
  return loadTopologies();
}

export function createTopology(name: string): Topology {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: name.trim(),
    running: false,
    nodes: [],
    edges: [],
    blocks: [],
    createdAt: now,
    updatedAt: now,
  };
}
