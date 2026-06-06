import { useState } from "react";
import { BsWrench, IoChevronDown, IoChevronForward } from "../../icons";
import { Text, XStack, YStack } from "tamagui";
import { ToolToggle } from "../../components/ToolToggle";
import { InlineLoader } from "../../components/InlineLoader";
import type { McpToolInfo } from "../../services/mcp_installed/toolsApi";
import { colors } from "../../theme";
import { mcpBlackBlock } from "./mcpTableStyles";
import { McpSectionHeader } from "./McpSectionHeader";

type McpToolsListProps = {
  tools: McpToolInfo[];
  loading?: boolean;
  error?: string | null;
  toolEnabled: Record<string, boolean>;
  onToggleTool: (toolName: string, enabled: boolean) => void;
};

function ToolRow({
  tool,
  enabled,
  onToggleEnabled,
}: {
  tool: McpToolInfo;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ ...mcpBlackBlock, opacity: enabled ? 1 : 0.75 }}>
      <XStack px={10} py={8} items="center" gap={8}>
        <XStack
          flex={1}
          minW={0}
          items="center"
          gap={8}
          cursor="pointer"
          onPress={() => setExpanded((value) => !value)}
        >
          <XStack width={18} items="center" justify="center" shrink={0}>
            {expanded ? (
              <IoChevronDown size={14} color={colors.muted} />
            ) : (
              <IoChevronForward size={14} color={colors.muted} />
            )}
          </XStack>
          <BsWrench size={13} color={colors.accent} aria-hidden style={{ flexShrink: 0 }} />
          <Text
            color={enabled ? colors.foreground : colors.muted}
            fontSize={12}
            fontWeight="600"
            numberOfLines={1}
            flex={1}
            select="none"
          >
            {tool.name}
          </Text>
        </XStack>
        <ToolToggle
          checked={enabled}
          onChange={onToggleEnabled}
          ariaLabel={`${enabled ? "Disable" : "Enable"} tool ${tool.name}`}
        />
      </XStack>
      {expanded ? (
        <YStack px={10} pb={10} pt={0}>
          <Text color={colors.muted} fontSize={11} lineHeight={16} select="none">
            {tool.description || "No description provided."}
          </Text>
        </YStack>
      ) : null}
    </div>
  );
}

export function McpToolsList({
  tools,
  loading = false,
  error = null,
  toolEnabled,
  onToggleTool,
}: McpToolsListProps) {
  if (loading) {
    return (
      <YStack gap={8}>
        <McpSectionHeader title="Tools" />
        <InlineLoader label="Connecting to server…" minHeight={64} />
      </YStack>
    );
  }

  if (error || tools.length === 0) {
    return null;
  }

  return (
    <YStack gap={8}>
      <McpSectionHeader title="Tools" />
      <YStack gap={6}>
        {tools.map((tool) => (
          <ToolRow
            key={tool.name}
            tool={tool}
            enabled={toolEnabled[tool.name] !== false}
            onToggleEnabled={(next) => onToggleTool(tool.name, next)}
          />
        ))}
      </YStack>
    </YStack>
  );
}
