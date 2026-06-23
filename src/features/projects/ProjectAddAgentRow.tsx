import { IoAdd } from "../../icons";
import { PANE_ROW_MIN_HEIGHT, PANE_ROW_PADDING, PANE_ROW_RADIUS } from "../../components/pane/paneStyles";
import { borders, colors } from "../../theme";

type ProjectAddAgentRowProps = {
  rowRef?: (node: HTMLButtonElement | null) => void;
  onClick?: () => void;
};

export function ProjectAddAgentRow({ rowRef, onClick }: ProjectAddAgentRowProps) {
  return (
    <button
      type="button"
      ref={rowRef}
      aria-label="Add agent"
      onClick={onClick}
      className="mcp-list-card-shell"
      style={{
        minHeight: PANE_ROW_MIN_HEIGHT,
        padding: `${PANE_ROW_PADDING}px ${PANE_ROW_PADDING + 2}px`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderRadius: PANE_ROW_RADIUS,
        border: `1px solid ${borders.default}`,
        background: "transparent",
        boxSizing: "border-box",
        cursor: "pointer",
        fontFamily: "inherit",
        width: "100%",
        maxWidth: 280,
      }}
    >
      <span
        style={{
          width: 14,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: colors.muted,
          flexShrink: 0,
        }}
        aria-hidden
      >
        <IoAdd size={16} />
      </span>
      <span
        style={{
          color: colors.foreground,
          fontSize: 14,
          fontWeight: 600,
          userSelect: "none",
        }}
      >
        Add agent
      </span>
    </button>
  );
}
