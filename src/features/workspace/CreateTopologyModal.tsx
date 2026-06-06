import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { GlassPanel } from "../../components/Glass/GlassPanel";
import { borders, colors, tamaguiSurfaces } from "../../theme";

type CreateTopologyModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
};

export function CreateTopologyModal({
  open,
  onClose,
  onCreate,
}: CreateTopologyModalProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setName("");
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

  const canCreate = name.trim().length > 0;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
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
        style={{ width: "min(420px, 100%)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <GlassPanel glow rounded={16} overflow="hidden">
          <YStack gap={16} px={20} py={18} z={1}>
            <YStack gap={4}>
              <Text color={colors.foreground} fontSize={20} fontWeight="700">
                New topology
              </Text>
              <Text color={colors.muted.trim() as never} fontSize={13}>
                Name your agent and MCP configuration.
              </Text>
            </YStack>

            <Input
              value={name}
              onChangeText={setName}
              placeholder="Production stack"
              color={colors.foreground}
              placeholderTextColor={colors.muted as never}
              bg={tamaguiSurfaces.controlBg}
              borderWidth={1}
              borderColor={tamaguiSurfaces.activeBg}
              rounded={8}
              px={12}
              py={10}
              fontSize={13}
            />

            <XStack justify="flex-end" gap={10}>
              <Button unstyled px={12} py={8} rounded={8} onPress={onClose}>
                <Text color={colors.muted.trim() as never} fontSize={13}>
                  Cancel
                </Text>
              </Button>
              <Button
                unstyled
                px={12}
                py={8}
                rounded={8}
                bg={canCreate ? borders.strong : tamaguiSurfaces.controlBg}
                opacity={canCreate ? 1 : 0.5}
                disabled={!canCreate}
                onPress={() => {
                  if (!canCreate) {
                    return;
                  }
                  onCreate(name.trim());
                  onClose();
                }}
              >
                <Text color={colors.foreground} fontSize={13} fontWeight="600">
                  Create
                </Text>
              </Button>
            </XStack>
          </YStack>
        </GlassPanel>
      </div>
    </div>,
    document.body,
  );
}
