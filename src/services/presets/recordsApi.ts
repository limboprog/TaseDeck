import { invoke } from "@tauri-apps/api/core";
import type { Preset, PresetDraft } from "./types";

export type PresetRecord = {
  id: number;
  name: string;
  serverFingerprint: string;
  mcpServerIds: number[];
  createdAt: string;
  updatedAt: string;
};

export function presetRecordToPreset(record: PresetRecord): Preset {
  return {
    id: String(record.id),
    name: record.name,
    mcpServerIds: record.mcpServerIds,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listPresetRecords(): Promise<Preset[]> {
  const records = await invoke<PresetRecord[]>("preset_record_list");
  return records.map(presetRecordToPreset);
}

export async function createPresetRecord(draft: PresetDraft): Promise<Preset> {
  const created = await invoke<PresetRecord>("preset_record_create", {
    name: draft.name.trim(),
  });
  return presetRecordToPreset(created);
}

export async function updatePresetRecord(
  id: string,
  patch: Partial<Pick<Preset, "name" | "mcpServerIds">>,
): Promise<Preset> {
  const numericId = Number(id);
  const updated = await invoke<PresetRecord>("preset_record_update", {
    id: numericId,
    name: patch.name ?? null,
    mcpServerIds: patch.mcpServerIds ?? null,
  });
  return presetRecordToPreset(updated);
}

export async function deletePresetRecord(id: string): Promise<boolean> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return false;
  }
  return invoke<boolean>("preset_record_delete", { id: numericId });
}

export type PresetTryDeleteResult = {
  deleted: boolean;
  inUse: boolean;
};

export async function tryDeletePresetRecord(id: string): Promise<PresetTryDeleteResult> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return { deleted: false, inUse: false };
  }
  return invoke<PresetTryDeleteResult>("preset_record_try_delete", { id: numericId });
}
