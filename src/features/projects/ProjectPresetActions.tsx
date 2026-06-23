import { useCallback, useMemo, useState } from "react";
import type { PaneIconMenuRow } from "../../components/pane/PaneIconMenu";
import { PaneIconMenu } from "../../components/pane/PaneIconMenu";
import { JsonPreviewDialog } from "../../components/JsonPreviewDialog";
import { SimpleNameDialog } from "../../components/SimpleNameDialog";
import type { Preset } from "../../services/presets";
import type { AgentPresetMode } from "../../services/projects/detailApi";
import { defaultSavedPresetName } from "./projectPresetNaming";

type ProjectPresetActionsProps = {
  presetName: string;
  presetMode: AgentPresetMode;
  hasDefaultPreset: boolean;
  hasAssignment: boolean;
  defaultSourceMcpJson: string | null;
  savedPresets: Preset[];
  onSaveAs: (name: string) => void | Promise<void>;
  onImport: (presetId: string) => void | Promise<void>;
  onDeleteCustom: () => void | Promise<void>;
  onResetAgent: () => void | Promise<void>;
  onUseDefault: () => void | Promise<void>;
  onUseCustom: () => void | Promise<void>;
};

export function ProjectPresetActions({
  presetName,
  presetMode,
  hasDefaultPreset,
  hasAssignment,
  defaultSourceMcpJson,
  savedPresets,
  onSaveAs,
  onImport,
  onDeleteCustom,
  onResetAgent,
  onUseDefault,
  onUseCustom,
}: ProjectPresetActionsProps) {
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [jsonDefaultOpen, setJsonDefaultOpen] = useState(false);
  const [presetOptions, setPresetOptions] = useState<Preset[]>(savedPresets);

  const importablePresets = useMemo(
    () => presetOptions.filter((preset) => preset.mcpServerIds.length > 0),
    [presetOptions],
  );

  const menuRows = useMemo((): PaneIconMenuRow[] => {
    const rows: PaneIconMenuRow[] = [
      {
        type: "item",
        key: "use-default",
        label: "Use default preset",
        disabled: !hasDefaultPreset || (hasAssignment && presetMode === "default"),
        onPick: () => void onUseDefault(),
      },
      {
        type: "item",
        key: "use-custom",
        label: "Use custom preset",
        disabled: hasAssignment && presetMode === "custom",
        onPick: () => void onUseCustom(),
      },
      {
        type: "item",
        key: "save-as",
        label: "Save as",
        disabled: !hasAssignment,
        onPick: () => setSaveAsOpen(true),
      },
      {
        type: "group",
        id: "import",
        label: "Import",
        emptyMessage: "No saved presets",
        disabled: presetMode === "default",
        items: importablePresets.map((preset) => ({
          key: preset.id,
          label: preset.name,
          onPick: () => void onImport(preset.id),
        })),
      },
      {
        type: "item",
        key: "copy-default-json",
        label: "JSON default",
        icon: "copy",
        disabled: !defaultSourceMcpJson,
        onPick: () => setJsonDefaultOpen(true),
      },
      {
        type: "item",
        key: "delete",
        label: "Delete",
        danger: true,
        icon: "trash",
        disabled: !hasAssignment || presetMode !== "custom",
        onPick: () => void onDeleteCustom(),
      },
      {
        type: "item",
        key: "reset-agent",
        label: "Reset agent",
        danger: true,
        icon: "restore",
        onPick: () => void onResetAgent(),
      },
    ];
    return rows;
  }, [
    defaultSourceMcpJson,
    hasAssignment,
    hasDefaultPreset,
    importablePresets,
    onDeleteCustom,
    onImport,
    onResetAgent,
    onUseCustom,
    onUseDefault,
    presetMode,
  ]);

  const handleMenuOpen = useCallback(() => {
    setPresetOptions(savedPresets);
  }, [savedPresets]);

  return (
    <>
      <PaneIconMenu
        ariaLabel="Preset actions"
        rows={menuRows}
        onOpen={handleMenuOpen}
      />
      <JsonPreviewDialog
        open={jsonDefaultOpen}
        title="JSON default"
        value={defaultSourceMcpJson ?? "{}"}
        onClose={() => setJsonDefaultOpen(false)}
      />
      <SimpleNameDialog
        open={saveAsOpen}
        title="Save preset as"
        initialName={defaultSavedPresetName(presetName)}
        confirmLabel="Save"
        onClose={() => setSaveAsOpen(false)}
        onConfirm={(name) => {
          setSaveAsOpen(false);
          void onSaveAs(name);
        }}
      />
    </>
  );
}
