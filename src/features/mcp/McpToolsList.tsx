import { useMemo, useRef, useState } from "react";
import { BsWrench, IoChevronDown, IoChevronForward } from "../../icons";
import { Text, XStack, YStack } from "tamagui";
import { ToolToggle } from "../../components/ToolToggle";
import { InlineLoader } from "../../components/InlineLoader";
import type { McpToolInfo } from "../../services/mcp_installed/toolsApi";
import { colors } from "../../theme";
import { mcpBlackBlock } from "./mcpTableStyles";
import { McpSectionHeader } from "./McpSectionHeader";
import { McpTableHeaderCopy } from "./table/McpTableCells";
import {
  findScrollParent,
  preserveScrollWhile,
} from "./preserveScrollOnLayout";

type McpToolsListProps = {
  tools: McpToolInfo[];
  loading?: boolean;
  error?: string | null;
  toolEnabled: Record<string, boolean>;
  onToggleTool: (toolName: string, enabled: boolean) => void;
};

function formatToolSchema(schema: unknown): string {
  if (schema == null) {
    return "";
  }
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return String(schema);
  }
}

function ToolSchemaSection({ schemaText }: { schemaText: string }) {
  const [schemaExpanded, setSchemaExpanded] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const toggleSchemaExpanded = () => {
    const scrollParent = findScrollParent(anchorRef.current);
    preserveScrollWhile(scrollParent, anchorRef.current, () => {
      setSchemaExpanded((value) => !value);
    });
  };

  return (
    <div ref={anchorRef}>
      <YStack gap={6}>
      <XStack items="center" justify="space-between" gap={8}>
        <XStack
          flex={1}
          minW={0}
          items="center"
          gap={6}
          cursor="pointer"
          onPress={toggleSchemaExpanded}
        >
          <XStack width={16} items="center" justify="center" shrink={0}>
            {schemaExpanded ? (
              <IoChevronDown size={13} color={colors.muted} />
            ) : (
              <IoChevronForward size={13} color={colors.muted} />
            )}
          </XStack>
          <Text color={colors.muted} fontSize={12} fontWeight="500" select="none">
            Input schema
          </Text>
        </XStack>
        {schemaExpanded ? <McpTableHeaderCopy value={schemaText} /> : null}
      </XStack>
      {schemaExpanded ? (
        <pre
          style={{
            margin: 0,
            padding: 0,
            color: colors.foreground,
            fontSize: 13,
            lineHeight: "20px",
            fontFamily: "ui-monospace, monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {schemaText}
        </pre>
      ) : null}
      </YStack>
    </div>
  );
}

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
  const anchorRef = useRef<HTMLDivElement>(null);
  const schemaText = useMemo(
    () => formatToolSchema(tool.inputSchema),
    [tool.inputSchema],
  );

  const toggleExpanded = () => {
    const scrollParent = findScrollParent(anchorRef.current);
    preserveScrollWhile(scrollParent, anchorRef.current, () => {
      setExpanded((value) => !value);
    });
  };

  return (
    <div
      ref={anchorRef}
      style={{ ...mcpBlackBlock, opacity: enabled ? 1 : 0.75, overflowAnchor: "none" }}
    >
      <XStack px={10} py={8} items="center" gap={8}>
        <XStack
          flex={1}
          minW={0}
          items="center"
          gap={8}
          cursor="pointer"
          onPress={toggleExpanded}
        >
          <XStack width={18} items="center" justify="center" shrink={0}>
            {expanded ? (
              <IoChevronDown size={14} color={colors.muted} />
            ) : (
              <IoChevronForward size={14} color={colors.muted} />
            )}
          </XStack>
          <BsWrench size={14} color={colors.accent} aria-hidden style={{ flexShrink: 0 }} />
          <Text
            color={enabled ? colors.foreground : colors.muted}
            fontSize={13}
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
        <YStack px={10} pb={10} pt={0} gap={10}>
          <Text color={colors.muted} fontSize={13} lineHeight={20} select="none">
            {tool.description || "No description provided."}
          </Text>
          {schemaText ? <ToolSchemaSection schemaText={schemaText} /> : null}
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
