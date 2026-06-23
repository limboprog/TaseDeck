import { useCallback, useEffect, useMemo, useState } from "react";
import { IoAdd } from "../../icons";
import { Text, XStack, YStack } from "tamagui";
import { PaneView, ToolbarIconButton } from "../../components/pane";
import { useInstalledMcpServers } from "../../services/mcp_installed";
import { usePresets } from "../../services/presets";
import { useMcpInstalledConnectionStatuses } from "../mcp/useMcpInstalledConnectionStatuses";
import {
  defaultPresetsPageSession,
  PRESETS_PAGE_SESSION_KEY,
  readPageSession,
  writePageSession,
} from "../../session/appSession";
import { colors } from "../../theme";
import { pageContentInsets } from "../../styles/layout";
import { PresetBlock } from "./PresetBlock";
import { PresetCreateRow } from "./PresetCreateRow";

type PresetsPageProps = {
  presetsActive?: boolean;
};

export function PresetsPage({ presetsActive = true }: PresetsPageProps) {
  const { presets, addPreset, removePreset, addServerToPreset, removeServerFromPreset } =
    usePresets();
  const { servers: installedServers } = useInstalledMcpServers();
  const { statuses: connectionStatuses } = useMcpInstalledConnectionStatuses(installedServers);

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const session = readPageSession(PRESETS_PAGE_SESSION_KEY, defaultPresetsPageSession());
    return new Set(session.expandedPresetIds ?? []);
  });

  useEffect(() => {
    if (!presetsActive) {
      return;
    }
    writePageSession(PRESETS_PAGE_SESSION_KEY, {
      expandedPresetIds: [...expandedIds],
    });
  }, [expandedIds, presetsActive]);

  useEffect(() => {
    setExpandedIds((current) => {
      const valid = new Set(presets.map((preset) => preset.id));
      const filtered = new Set([...current].filter((id) => valid.has(id)));
      if (filtered.size > 0 || presets.length === 0) {
        return filtered;
      }
      return new Set(presets.map((preset) => preset.id));
    });
  }, [presets]);

  const resetCreate = useCallback(() => {
    setCreating(false);
    setDraftName("");
  }, []);

  const handleStartCreate = useCallback(() => {
    setCreating(true);
    setDraftName("");
  }, []);

  const handleCommitCreate = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      return;
    }
    void addPreset({ name: trimmed }).then((created) => {
      setExpandedIds((current) => new Set([...current, created.id]));
      resetCreate();
    });
  }, [addPreset, draftName, resetCreate]);

  const toggleExpanded = useCallback((presetId: string, expanded: boolean) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(presetId);
      } else {
        next.delete(presetId);
      }
      return next;
    });
  }, []);

  const showEmptyHint = presets.length === 0 && !creating;

  const sortedPresets = useMemo(
    () => [...presets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [presets],
  );

  return (
    <YStack flex={1} minH={0} minW={0} overflow="hidden" {...pageContentInsets}>
      <PaneView
        flex={1}
        header={
          <XStack items="center" justify="space-between" pb={4}>
            <Text color={colors.foreground} fontSize={15} fontWeight="600" select="none">
              Presets
            </Text>
            <ToolbarIconButton
              onClick={handleStartCreate}
              disabled={creating}
              aria-label="Add preset"
            >
              <IoAdd size={20} />
            </ToolbarIconButton>
          </XStack>
        }
      >
        {showEmptyHint ? (
          <YStack flex={1} justify="center" items="center" px={12} pt={8}>
            <Text color={colors.muted} fontSize={13} text="center" select="none">
              No presets yet. Click + to create one.
            </Text>
          </YStack>
        ) : (
          <div
            className="td-scroll-y"
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingBottom: 8,
            }}
          >
            {creating ? (
              <PresetCreateRow
                name={draftName}
                onNameChange={setDraftName}
                onCancel={resetCreate}
                onCommit={handleCommitCreate}
              />
            ) : null}

            {sortedPresets.map((preset) => (
              <PresetBlock
                key={preset.id}
                preset={preset}
                installedServers={installedServers}
                connectionStatuses={connectionStatuses}
                expanded={expandedIds.has(preset.id)}
                onExpandedChange={(next) => toggleExpanded(preset.id, next)}
                onDeletePreset={() => removePreset(preset.id)}
                onAddServer={(mcpServerId) => addServerToPreset(preset.id, mcpServerId)}
                onRemoveServer={(mcpServerId) =>
                  removeServerFromPreset(preset.id, mcpServerId)
                }
              />
            ))}
          </div>
        )}
      </PaneView>
    </YStack>
  );
}
