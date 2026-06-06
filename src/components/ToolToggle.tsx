import { borders, colors } from "../theme";

type ToolToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
};

export function ToolToggle({ checked, onChange, ariaLabel }: ToolToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        border: "none",
        background: checked ? colors.accent : borders.selected,
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0,
        transition: "background 0.15s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          transition: "left 0.15s ease",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.35)",
        }}
      />
    </button>
  );
}
