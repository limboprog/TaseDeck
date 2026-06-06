import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { GlassPanel } from "../../components/Glass/GlassPanel";
import type { WorkspaceDraft } from "../../services/workspace";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import { PathEntryList } from "./PathEntryList";

type CreateWorkspaceModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (draft: WorkspaceDraft) => void;
};

const EMPTY_DRAFT: WorkspaceDraft = {
  name: "",
  agents: [],
  mcps: [],
};

export function CreateWorkspaceModal({
  open,
  onClose,
  onCreate,
}: CreateWorkspaceModalProps) {
  const [draft, setDraft] = useState<WorkspaceDraft>(EMPTY_DRAFT);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(EMPTY_DRAFT);

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

  const canCreate = draft.name.trim().length > 0;

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
        style={{ width: "min(640px, 100%)", maxHeight: "calc(100vh - 48px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <GlassPanel
          glow
          rounded={16}
          overflow="hidden"
          maxH="calc(100vh - 48px)"
          display="flex"
          flexDirection="column"
        >
          <XStack
            justify="space-between"
            items="flex-start"
            gap={12}
            px={20}
            py={18}
            borderBottomWidth={1}
            borderBottomColor={tamaguiSurfaces.controlHoverBg}
            z={1}
          >
            <YStack gap={4}>
              <Text
                color={colors.foreground}
                fontSize={22}
                fontWeight="700"
                letterSpacing={-0.02}
              >
                New workspace
              </Text>
              <Text color={colors.muted} fontSize={13}>
                Choose agents and MCP servers for this workspace.
              </Text>
            </YStack>
            <Button
              unstyled
              px={10}
              py={6}
              rounded={8}
              bg={tamaguiSurfaces.controlHoverBg}
              hoverStyle={{ bg: borders.strong }}
              onPress={onClose}
              aria-label="Close"
            >
              <Text color={colors.foreground} fontSize={18} lineHeight={18}>
                ×
              </Text>
            </Button>
          </XStack>

          <div
            style={{
              overflow: "auto",
              flex: 1,
              minHeight: 0,
            }}
          >
            <YStack gap={16} px={20} py={18} z={1}>
              <YStack gap={6}>
                <Text color={colors.foreground} fontSize={13} fontWeight="500">
                  Name
                </Text>
                <Input
                  value={draft.name}
                  onChangeText={(name) =>
                    setDraft((current) => ({ ...current, name }))
                  }
                  placeholder="My workspace"
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
              </YStack>

              <PathEntryList
                title="Agents"
                emptyLabel="No agents added yet."
                pathPlaceholder="/path/to/agent"
                entries={draft.agents}
                onChange={(agents) =>
                  setDraft((current) => ({ ...current, agents }))
                }
              />

              <PathEntryList
                title="MCP"
                emptyLabel="No MCP servers added yet."
                pathPlaceholder="/path/to/mcp-server"
                entries={draft.mcps}
                onChange={(mcps) =>
                  setDraft((current) => ({ ...current, mcps }))
                }
              />
            </YStack>
          </div>

          <XStack
            justify="flex-end"
            gap={10}
            px={20}
            py={16}
            borderTopWidth={1}
            borderTopColor={tamaguiSurfaces.controlHoverBg}
            z={1}
          >
            <Button
              unstyled
              px={14}
              py={9}
              rounded={8}
              onPress={onClose}
            >
              <Text color={colors.muted} fontSize={13}>
                Cancel
              </Text>
            </Button>
            <Button
              unstyled
              px={14}
              py={9}
              rounded={8}
              bg={canCreate ? borders.strong : tamaguiSurfaces.controlBg}
              opacity={canCreate ? 1 : 0.5}
              hoverStyle={{ bg: borders.selected }}
              disabled={!canCreate}
              onPress={() => {
                if (!canCreate) {
                  return;
                }
                onCreate({
                  name: draft.name.trim(),
                  agents: draft.agents,
                  mcps: draft.mcps,
                });
                onClose();
              }}
            >
              <Text color={colors.foreground} fontSize={13} fontWeight="500">
                Create
              </Text>
            </Button>
          </XStack>
        </GlassPanel>
      </div>
    </div>,
    document.body,
  );
}
