import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Text, XStack, YStack } from "tamagui";
import { GlassPanel } from "./Glass/GlassPanel";
import { colors, surfaces, tamaguiSurfaces } from "../theme";
import { paneCompactActionStyle } from "./pane/paneStyles";

type SimpleNameDialogProps = {
  open: boolean;
  title: string;
  initialName?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
};

const ACCENT_HOVER = "#9D6FF8";

function withHover(
  element: HTMLButtonElement,
  enabled: boolean,
  accent: boolean,
) {
  if (!enabled) {
    return;
  }
  element.style.background = accent ? ACCENT_HOVER : surfaces.controlHover;
}

function resetHover(element: HTMLButtonElement, accent: boolean, disabled: boolean) {
  element.style.background = accent && !disabled ? colors.accent : "transparent";
}

export function SimpleNameDialog({
  open,
  title,
  initialName = "",
  confirmLabel = "Save",
  onClose,
  onConfirm,
}: SimpleNameDialogProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(initialName);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [initialName, onClose, open]);

  if (!open) {
    return null;
  }

  const trimmed = name.trim();
  const canConfirm = trimmed.length > 0;

  const cancelStyle: CSSProperties = paneCompactActionStyle();
  const saveStyle: CSSProperties = paneCompactActionStyle({
    accent: true,
    disabled: !canConfirm,
  });

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div style={{ width: "min(420px, 100%)" }} onClick={(event) => event.stopPropagation()}>
        <GlassPanel glow rounded={14} overflow="hidden" p={16}>
          <YStack gap={12}>
            <XStack items="center" justify="space-between" gap={12}>
              <Text color={colors.foreground} fontSize={15} fontWeight="600" select="none">
                {title}
              </Text>
              <XStack gap={8} shrink={0}>
                <button
                  type="button"
                  onClick={onClose}
                  onMouseEnter={(event) => withHover(event.currentTarget, true, false)}
                  onMouseLeave={(event) => resetHover(event.currentTarget, false, false)}
                  style={cancelStyle}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canConfirm}
                  onClick={() => {
                    if (canConfirm) {
                      onConfirm(trimmed);
                    }
                  }}
                  onMouseEnter={(event) => withHover(event.currentTarget, canConfirm, true)}
                  onMouseLeave={(event) => resetHover(event.currentTarget, true, !canConfirm)}
                  style={saveStyle}
                >
                  {confirmLabel}
                </button>
              </XStack>
            </XStack>
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canConfirm) {
                  onConfirm(trimmed);
                }
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                color: colors.foreground,
                background: tamaguiSurfaces.controlBg,
                border: `1px solid ${tamaguiSurfaces.controlBorder}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </YStack>
        </GlassPanel>
      </div>
    </div>,
    document.body,
  );
}
