import { VscSettings } from "../../icons";
import { useMemo } from "react";
import { Text, YStack } from "tamagui";
import type { Preset } from "../../services/presets";
import { borders, colors, project } from "../../theme";
import { PANE_ROW_RADIUS } from "../../components/pane/paneStyles";

type ProjectPresetPickerProps = {
  presets: Preset[];
  onPick: (presetId: string) => void;
};

export function ProjectPresetPicker({ presets, onPick }: ProjectPresetPickerProps) {
  const sorted = useMemo(
    () => [...presets].sort((left, right) => left.name.localeCompare(right.name)),
    [presets],
  );

  if (sorted.length === 0) {
    return (
      <Text color={colors.muted} fontSize={12} py={4} select="none">
        No presets available. Create one on the Presets tab.
      </Text>
    );
  }

  return (
    <YStack gap={6} width="100%" maxW={320}>
      {sorted.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onPick(preset.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 10px",
            borderRadius: PANE_ROW_RADIUS,
            border: `1px solid ${borders.faint}`,
            background: project.nodeSignificant,
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <VscSettings size={16} color={colors.muted} aria-hidden />
          <Text color={colors.foreground} fontSize={13} fontWeight="600" select="none">
            {preset.name}
          </Text>
        </button>
      ))}
    </YStack>
  );
}
