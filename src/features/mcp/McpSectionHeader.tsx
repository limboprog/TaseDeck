import { IoAdd } from "../../icons";
import { XStack } from "tamagui";
import { borders, colors, surfaces, whiteAlpha } from "../../theme";
import { SectionLabel } from "./McpEnvVariablesInline";

type McpSectionHeaderProps = {
  title: string;
  onAdd?: () => void;
  addDisabled?: boolean;
  addLabel?: string;
};

export function McpSectionHeader({
  title,
  onAdd,
  addDisabled = false,
  addLabel = "Add",
}: McpSectionHeaderProps) {
  return (
    <XStack items="center" justify="space-between" gap={8}>
      <SectionLabel>{title}</SectionLabel>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          disabled={addDisabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            height: 28,
            padding: "0 10px",
            borderRadius: 6,
            border: `1px solid ${borders.default}`,
            background: addDisabled ? surfaces.disabled : surfaces.controlHover,
            color: addDisabled ? whiteAlpha[28] : colors.foreground,
            fontSize: 11,
            fontWeight: 500,
            cursor: addDisabled ? "not-allowed" : "pointer",
          }}
        >
          <IoAdd size={14} />
          {addLabel}
        </button>
      ) : null}
    </XStack>
  );
}
