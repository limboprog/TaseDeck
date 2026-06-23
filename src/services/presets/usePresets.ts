import { useCallback, useEffect, useState } from "react";
import {
  createPresetRecord,
  deletePresetRecord,
  listPresetRecords,
  updatePresetRecord,
} from "./recordsApi";
import { notifyPresetsChanged, PRESETS_CHANGED_EVENT } from "./storage";
import type { Preset, PresetDraft } from "./types";

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([]);

  const syncFromStorage = useCallback(async () => {
    try {
      setPresets(await listPresetRecords());
    } catch {
      setPresets([]);
    }
  }, []);

  useEffect(() => {
    void syncFromStorage();
    const onChanged = () => {
      void syncFromStorage();
    };
    window.addEventListener(PRESETS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PRESETS_CHANGED_EVENT, onChanged);
  }, [syncFromStorage]);

  const addPreset = useCallback(async (draft: PresetDraft) => {
    const preset = await createPresetRecord(draft);
    notifyPresetsChanged();
    return preset;
  }, []);

  const updatePreset = useCallback(
    async (id: string, patch: Partial<Pick<Preset, "name" | "mcpServerIds">>) => {
      await updatePresetRecord(id, patch);
      notifyPresetsChanged();
    },
    [],
  );

  const removePreset = useCallback(async (id: string) => {
    await deletePresetRecord(id);
    notifyPresetsChanged();
  }, []);

  const addServerToPreset = useCallback(
    async (presetId: string, mcpServerId: number) => {
      const preset = presets.find((entry) => entry.id === presetId);
      if (!preset || preset.mcpServerIds.includes(mcpServerId)) {
        return;
      }
      await updatePresetRecord(presetId, {
        mcpServerIds: [...preset.mcpServerIds, mcpServerId],
      });
      notifyPresetsChanged();
    },
    [presets],
  );

  const removeServerFromPreset = useCallback(
    async (presetId: string, mcpServerId: number) => {
      const preset = presets.find((entry) => entry.id === presetId);
      if (!preset) {
        return;
      }
      await updatePresetRecord(presetId, {
        mcpServerIds: preset.mcpServerIds.filter((id) => id !== mcpServerId),
      });
      notifyPresetsChanged();
    },
    [presets],
  );

  return {
    presets,
    addPreset,
    updatePreset,
    removePreset,
    addServerToPreset,
    removeServerFromPreset,
    refresh: syncFromStorage,
  };
}

export { notifyPresetsChanged };
