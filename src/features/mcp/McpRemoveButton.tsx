import { IoTrash } from "../../icons";
import { XStack } from "tamagui";
import { colors, dangerAlpha } from "../../theme";

type McpRemoveButtonProps = {
  onClick: () => void;
  ariaLabel: string;
};

export function McpRemoveButton({ onClick, ariaLabel }: McpRemoveButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onClick();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      aria-label={ariaLabel}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: "none",
        background: "transparent",
        color: colors.muted,
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = dangerAlpha[12];
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      <XStack items="center" justify="center">
        <IoTrash size={14} />
      </XStack>
    </button>
  );
}
