import { IoArrowBackOutline, IoArrowForwardOutline } from "../../icons";
import { Text } from "tamagui";
import { colors } from "../../theme";

type ProjectDetailHeaderProps = {
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

const historyButtonStyle = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "none",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontFamily: "inherit",
} as const;

export function ProjectDetailHeader({
  projectName,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ProjectDetailHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
        lineHeight: "18px",
      }}
    >
      <Text color={colors.muted} fontSize={13} fontWeight="500" select="none" style={{ minWidth: 0 }}>
        Project:{" "}
        <Text color={colors.foreground} fontWeight="600" display="inline">
          {projectName}
        </Text>
      </Text>

      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
        <button
          type="button"
          aria-label="Undo server setting change"
          title="Undo"
          disabled={!canUndo}
          onClick={onUndo}
          style={{
            ...historyButtonStyle,
            color: colors.muted,
            opacity: canUndo ? 1 : 0.35,
            cursor: canUndo ? "pointer" : "default",
          }}
        >
          <IoArrowBackOutline size={16} />
        </button>
        <button
          type="button"
          aria-label="Redo server setting change"
          title="Redo"
          disabled={!canRedo}
          onClick={onRedo}
          style={{
            ...historyButtonStyle,
            color: colors.muted,
            opacity: canRedo ? 1 : 0.35,
            cursor: canRedo ? "pointer" : "default",
          }}
        >
          <IoArrowForwardOutline size={16} />
        </button>
      </div>
    </div>
  );
}
