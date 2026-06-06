import { memo, type ReactNode } from "react";
import { IoLogoGithub, PiGlobeThin } from "../../icons";
import { Text, XStack, YStack } from "tamagui";
import { McpPanel } from "./McpPanel";
import { entryKey, type McpServerEntry } from "../../services/mcp_registry";
import { borders, colors, market, tamaguiSurfaces } from "../../theme";
import { McpAddButton } from "./McpAddButton";
import { openExternal } from "../../utils/openExternal";

const LINK_BLOCK_WIDTH = 104;

type McpServerCardProps = {
  entry: McpServerEntry;
  onSelect?: (entry: McpServerEntry) => void;
};

function formatLinkLabel(url: string, fallback: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    if (path && path !== "/") {
      return `${host}${path}`;
    }
    return host || fallback;
  } catch {
    return fallback;
  }
}

function CardLinkBlock({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <XStack
      width={LINK_BLOCK_WIDTH}
      maxW={LINK_BLOCK_WIDTH}
      shrink={0}
      borderWidth={1}
      borderColor={tamaguiSurfaces.controlBorder}
      rounded={8}
      px={7}
      py={4}
      gap={5}
      items="center"
      overflow="hidden"
      cursor="pointer"
      hoverStyle={{ borderColor: borders.strong }}
      onPress={(event) => {
        event.stopPropagation();
        void openExternal(href);
      }}
    >
      <YStack shrink={0}>{icon}</YStack>
      <Text
        color={colors.foreground}
        fontSize={11}
        fontWeight={400}
        textDecorationLine="underline"
        numberOfLines={1}
        ellipsizeMode="tail"
        flex={1}
        minW={0}
        overflow="hidden"
      >
        {label}
      </Text>
    </XStack>
  );
}

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
              <CardLinkBlock
                href={websiteUrl}
                icon={<PiGlobeThin size={13} color={colors.muted} />}
                label={formatLinkLabel(websiteUrl, "Website")}
              />
            ) : null}
            {repositoryUrl ? (
              <CardLinkBlock
                href={repositoryUrl}
                icon={<IoLogoGithub size={13} color={colors.muted} />}
                label={formatLinkLabel(repositoryUrl, "GitHub")}
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
