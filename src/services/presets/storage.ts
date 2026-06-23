import { createId } from "../topology/storage";
import type { Preset, PresetDraft } from "./types";

const STORAGE_KEY = "tasedeck:presets";

export const PRESETS_CHANGED_EVENT = "presets-changed";

export function notifyPresetsChanged() {
  window.dispatchEvent(new CustomEvent(PRESETS_CHANGED_EVENT));
}

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Preset[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (preset) =>
        preset &&
        typeof preset.id === "string" &&
        typeof preset.name === "string" &&
        Array.isArray(preset.mcpServerIds),
    );
  } catch {
    return [];
  }
}

export function getStoredPresets(): Preset[] {
  return loadPresets();
}

export function savePresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  notifyPresetsChanged();
}

export function clearStoredPresets() {
  localStorage.removeItem(STORAGE_KEY);
  notifyPresetsChanged();
}

export function createPreset(draft: PresetDraft): Preset {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: draft.name.trim(),
    mcpServerIds: [],
    createdAt: now,
    updatedAt: now,
  };
}
