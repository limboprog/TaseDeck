import type { ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import { openExternal } from "../../utils/openExternal";

export const MCP_LINK_BLOCK_WIDTH = 104;

export function formatMcpLinkLabel(url: string, fallback: string) {
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

export function McpLinkBlock({
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
      width={MCP_LINK_BLOCK_WIDTH}
      maxW={MCP_LINK_BLOCK_WIDTH}
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
        fontWeight="400"
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
