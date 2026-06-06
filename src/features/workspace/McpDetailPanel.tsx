import { useState } from "react";
import { IoClose, IoRefresh } from "../../icons";
import { Button, Text, XStack, YStack } from "tamagui";
import { useMcpToolsSession } from "../../services/mcp_installed/useMcpToolsSession";
import { blackAlpha, blocks, borders, colors, tamaguiSurfaces } from "../../theme";
import { McpToolsList } from "../mcp/McpToolsList";

type McpDetailPanelProps = {
  serverId: number;
  onClose: () => void;
};

export function McpDetailPanel({ serverId, onClose }: McpDetailPanelProps) {
  const { snapshot, loading, toolEnabled, toggleTool, refresh } = useMcpToolsSession(
    serverId,
    true,
  );
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  };

  return (
    <YStack
      bg={colors.surface}
      overflow="hidden"
      style={{
        ...blocks.mcpPanel,
        position: "absolute",
        top: 12,
        right: 12,
        bottom: 12,
        width: 340,
        maxWidth: "38%",
        zIndex: 40,
        boxShadow: `0 10px 36px ${blackAlpha[32]}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <XStack
        items="center"
        justify="space-between"
        px={12}
        py={10}
        shrink={0}
        borderBottomWidth={1}
        borderBottomColor={borders.faint}
      >
        <Text
          color={colors.foreground}
          fontSize={14}
          fontWeight="600"
          numberOfLines={1}
          flex={1}
          minW={0}
          pr={8}
          select="none"
        >
          {snapshot?.serverName ?? "…"}
        </Text>

        <XStack items="center" gap={4} shrink={0}>
          <Button
            unstyled
            width={30}
            height={30}
            rounded={8}
            hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
            disabled={refreshing || loading}
            onPress={handleRefresh}
            aria-label="Refresh tools"
          >
            <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
              <IoRefresh size={16} />
            </XStack>
          </Button>
          <Button
            unstyled
            width={30}
            height={30}
            rounded={8}
            hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
            onPress={onClose}
            aria-label="Close panel"
          >
            <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
              <IoClose size={18} />
            </XStack>
          </Button>
        </XStack>
      </XStack>

      <YStack flex={1} minH={0} overflow="scroll" px={12} pb={12}>
        <McpToolsList
          tools={snapshot?.tools ?? []}
          loading={loading}
          error={snapshot?.error}
          toolEnabled={toolEnabled}
          onToggleTool={toggleTool}
        />
      </YStack>
    </YStack>
  );
}
