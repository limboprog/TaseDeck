import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Text, XStack, YStack } from "tamagui";
import { GlassPanel } from "./Glass/GlassPanel";
import { blocks, colors, surfaces, tamaguiSurfaces } from "../theme";
import { paneCompactActionStyle } from "./pane/paneStyles";

type JsonPreviewDialogProps = {
  open: boolean;
  title: string;
  value: string;
  onClose: () => void;
};

function formatJsonForDisplay(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function JsonPreviewDialog({ open, title, value, onClose }: JsonPreviewDialogProps) {
  const [copied, setCopied] = useState(false);
  const formatted = formatJsonForDisplay(value);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [formatted]);

  if (!open) {
    return null;
  }

  const closeStyle = paneCompactActionStyle();

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
      <div
        style={{ width: "min(640px, 100%)", maxHeight: "min(80vh, 720px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <GlassPanel glow rounded={14} overflow="hidden" p={0}>
          <YStack gap={0} maxH="min(80vh, 720px)">
            <XStack
              items="center"
              justify="space-between"
              gap={12}
              px={16}
              py={12}
              style={blocks.commandTerminalHeader}
            >
              <Text color={colors.foreground} fontSize={15} fontWeight="600" select="none">
                {title}
              </Text>
              <XStack gap={8} shrink={0}>
                <Button
                  unstyled
                  px={8}
                  py={4}
                  rounded={6}
                  bg={tamaguiSurfaces.controlHoverBg}
                  hoverStyle={{ bg: tamaguiSurfaces.controlHoverStrongBg }}
                  onPress={() => void copy()}
                >
                  <Text color={copied ? colors.accent : colors.foreground} fontSize={11} select="none">
                    {copied ? "Copied" : "Copy"}
                  </Text>
                </Button>
                <button
                  type="button"
                  onClick={onClose}
                  style={closeStyle}
                >
                  Close
                </button>
              </XStack>
            </XStack>
            <pre
              style={{
                margin: 0,
                padding: "12px 16px 16px",
                overflow: "auto",
                maxHeight: "calc(min(80vh, 720px) - 52px)",
                color: colors.foreground,
                background: surfaces.command,
                fontSize: 12,
                lineHeight: "18px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {formatted}
            </pre>
          </YStack>
        </GlassPanel>
      </div>
    </div>,
    document.body,
  );
}
