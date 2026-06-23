import { memo } from "react";
import { IoLogoGithub, PiGlobeThin } from "../../icons";
import { Text, XStack, YStack } from "tamagui";
import { McpPanel } from "./McpPanel";
import { entryKey, type McpServerEntry } from "../../services/mcp_registry";
import { borders, colors, market } from "../../theme";
import { McpAddButton } from "./McpAddButton";
import { formatMcpLinkLabel, McpLinkBlock } from "./mcpLinkBlock";

type McpServerCardProps = {
  entry: McpServerEntry;
  onSelect?: (entry: McpServerEntry) => void;
};

function McpServerCardInner({ entry, onSelect }: McpServerCardProps) {
  const { server } = entry;
  const title = server.title ?? server.name;
  const description =
    server.description?.trim() ||
    "MCP server for extending agent capabilities with external tools and data.";
  const websiteUrl = server.websiteUrl?.trim();
  const repositoryUrl = server.repository?.url?.trim();
  const hasLinks = Boolean(websiteUrl || repositoryUrl);

  return (
    <McpPanel
      p={16}
      flex={1}
      minW={0}
      height="100%"
      overflow="visible"
      cursor="pointer"
      onPress={() => onSelect?.(entry)}
      style={{
        transition: "transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease",
      }}
      hoverStyle={{
        borderColor: borders.strong,
        translateY: -2,
        boxShadow: market.cardHoverShadow,
      }}
      focusWithinStyle={{
        borderColor: borders.strong,
      }}
    >
      <YStack gap={10} z={1} flex={1} minH={0} justify="space-between">
        <YStack gap={8} flex={1} minH={0}>
          <XStack items="center" gap={10} minH={28}>
            <Text
              color={colors.foreground}
              fontSize={18}
              fontWeight="600"
              letterSpacing={-0.02}
              numberOfLines={1}
              flex={1}
              minW={0}
            >
              {title}
            </Text>
            <YStack shrink={0} justify="center" onPress={(event) => event.stopPropagation()}>
              <McpAddButton entry={entry} compact />
            </YStack>
          </XStack>

          <Text
            color={colors.muted}
            fontSize={13}
            lineHeight={20}
            flex={1}
            numberOfLines={hasLinks ? 2 : 3}
          >
            {description}
          </Text>
        </YStack>

        {hasLinks ? (
          <XStack gap={8} shrink={0} flexWrap="wrap">
            {websiteUrl ? (
              <McpLinkBlock
                href={websiteUrl}
                icon={<PiGlobeThin size={13} color={colors.muted} />}
                label={formatMcpLinkLabel(websiteUrl, "Website")}
              />
            ) : null}
            {repositoryUrl ? (
              <McpLinkBlock
                href={repositoryUrl}
                icon={<IoLogoGithub size={13} color={colors.muted} />}
                label={formatMcpLinkLabel(repositoryUrl, "GitHub")}
              />
            ) : null}
          </XStack>
        ) : null}
      </YStack>
    </McpPanel>
  );
}

export const McpServerCard = memo(
  McpServerCardInner,
  (prev, next) =>
    entryKey(prev.entry) === entryKey(next.entry) &&
    prev.onSelect === next.onSelect,
);
