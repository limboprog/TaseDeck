import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { XStack } from "tamagui";
import { McpPanel } from "../../features/mcp/McpPanel";
import { borders, colors } from "../../theme";
import {
  PANE_CREATE_CONTROL_HEIGHT,
  PANE_ROW_PADDING,
  PANE_ROW_RADIUS,
  paneCreateActionStyle,
  paneCreateControlShellStyle,
} from "./paneStyles";

type PaneCreateRowProps = {
  value?: string;
  onChange?: (value: string) => void;
  onCancel: () => void;
  onCommit: () => void;
  placeholder?: string;
  leading: ReactNode;
  cancelLabel?: string;
  control?: ReactNode;
};

/** Inline list card for naming a new item (+ flow in Topology and MCP). */
export function PaneCreateRow({
  value = "",
  onChange,
  onCancel,
  onCommit,
  placeholder = "",
  leading,
  cancelLabel = "Cancel",
  control,
}: PaneCreateRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!control) {
      inputRef.current?.focus();
    }
  }, [control]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <McpPanel
      className="mcp-list-card-shell pane-create-row"
      p={PANE_ROW_PADDING}
      rounded={PANE_ROW_RADIUS}
      borderColor={borders.default}
      bg={colors.surface as never}
      style={{
        background: colors.surface,
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
      }}
    >
      <XStack width="100%" items="center" justify="space-between" gap={12} minH={PANE_CREATE_CONTROL_HEIGHT}>
        <XStack flex={1} items="center" gap={8} minW={0}>
          {leading}
          {control ?? (
            <div style={paneCreateControlShellStyle()}>
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => onChange?.(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: colors.foreground,
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "inherit",
                }}
              />
            </div>
          )}
        </XStack>

        <XStack items="center" gap={6} shrink={0} height={PANE_CREATE_CONTROL_HEIGHT}>
          <button
            type="button"
            aria-label={cancelLabel}
            onClick={(event) => {
              event.stopPropagation();
              onCancel();
            }}
            style={{
              ...paneCreateActionStyle(),
              color: colors.muted,
            }}
          >
            {cancelLabel}
          </button>
        </XStack>
      </XStack>
    </McpPanel>
  );
}
