import type { TopologyBlock, TopologyNode } from "./types";

export type TopologyViewport = {
  pan: { x: number; y: number };
  zoom: number;
};

const STORAGE_KEY = "tasedeck-topology-viewport-v1";
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

export const DEFAULT_VIEWPORT: TopologyViewport = {
  pan: { x: 48, y: 48 },
  zoom: 1,
};

function readStore(): Record<string, TopologyViewport> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const store: Record<string, TopologyViewport> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isValidViewport(value)) {
        store[id] = value;
      }
    }
    return store;
  } catch {
    return {};
  }
}

function isValidViewport(value: unknown): value is TopologyViewport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as TopologyViewport;
  return (
    Number.isFinite(candidate.pan?.x) &&
    Number.isFinite(candidate.pan?.y) &&
    Number.isFinite(candidate.zoom) &&
    candidate.zoom >= MIN_ZOOM &&
    candidate.zoom <= MAX_ZOOM
  );
}

export function loadTopologyViewport(topologyId: string): TopologyViewport | null {
  return readStore()[topologyId] ?? null;
}

export function saveTopologyViewport(topologyId: string, viewport: TopologyViewport) {
  if (!isValidViewport(viewport)) {
    return;
  }
  const store = readStore();
  store[topologyId] = viewport;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Clears all saved per-topology viewports (debug / reset only). */
export function clearAllTopologyViewports() {
  localStorage.removeItem(STORAGE_KEY);
}

export function computeFitViewport(
  nodes: TopologyNode[],
  blocks: TopologyBlock[],
  viewportWidth: number,
  viewportHeight: number,
): TopologyViewport {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    if (node.blockId) {
      continue;
    }
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + 220);
    maxY = Math.max(maxY, node.y + 80);
  }

  for (const block of blocks) {
    minX = Math.min(minX, block.x);
    minY = Math.min(minY, block.y);
    maxX = Math.max(maxX, block.x + 280);
    maxY = Math.max(maxY, block.y + 160);
  }

  if (!Number.isFinite(minX)) {
    return DEFAULT_VIEWPORT;
  }

  const padding = 56;
  const contentW = Math.max(maxX - minX, 320);
  const contentH = Math.max(maxY - minY, 240);
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min((viewportWidth - padding * 2) / contentW, (viewportHeight - padding * 2) / contentH),
    ),
  );

  return {
    pan: {
      x: padding - minX * zoom,
      y: padding - minY * zoom,
    },
    zoom,
  };
}
