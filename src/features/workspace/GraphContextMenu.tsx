import { blocks, colors, whiteAlpha } from "../../theme";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export type GraphContextMenuAction = {
  id: string;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
};

type GraphContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  actions: GraphContextMenuAction[];
  onClose: () => void;
};

export function GraphContextMenu({ open, x, y, actions, onClose }: GraphContextMenuProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 15000 }}
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        style={{
          position: "fixed",
          left: x,
          top: y,
          zIndex: 15001,
          minWidth: 168,
          padding: 4,
          borderRadius: 10,
          border: blocks.contextMenu.border,
          background: blocks.contextMenu.background,
          boxShadow: blocks.contextMenu.boxShadow,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            onClick={() => {
              if (action.disabled) {
                return;
              }
              action.onSelect();
              onClose();
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              color: action.disabled
                ? whiteAlpha[28]
                : action.destructive
                  ? colors.errorSoft
                  : colors.foreground,
              fontSize: 13,
              fontWeight: 500,
              textAlign: "left",
              cursor: action.disabled ? "default" : "pointer",
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
