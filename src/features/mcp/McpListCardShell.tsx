import type { ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { McpPanel } from "./McpPanel";
import { borders, colors, surfaces } from "../../theme";
import { MCP_LIST_DESCRIPTION_STYLE } from "./mcpServerSummary";
import { MCP_LIST_CARD_BADGE_WIDTH, McpListCardKindBadge } from "./McpListCardKindBadge";
import type { McpListCardConnectionStatus } from "./mcpConnectionListStatus";
import type { McpListCardKind } from "./mcpListCardKind";
import { McpListCardConnectionLabel } from "./McpListCardConnectionLabel";

const CONTENT_GAP = 8;
const CARD_PADDING = 8;

type McpListCardShellProps = {
  kind: McpListCardKind;
  title: string;
  description: string;
  selected?: boolean;
  onPress?: () => void;
  showConnectionStatus?: boolean;
  connectionStatus?: McpListCardConnectionStatus;
  onSignIn?: () => void;
  onReadMore?: () => void;
  actions: ReactNode;
  alwaysShowReadMore?: boolean;
  readMoreTextOnly?: boolean;
  hideDescription?: boolean;
};

export function McpListCardShell({
  kind,
  title,
  description,
  selected = false,
  onPress,
  showConnectionStatus = false,
  connectionStatus,
  onSignIn,
  onReadMore,
  actions,
  alwaysShowReadMore = false,
  readMoreTextOnly = false,
  hideDescription = false,
}: McpListCardShellProps) {
  const showFooterStatus =
    showConnectionStatus &&
    (connectionStatus != null || (alwaysShowReadMore && onReadMore != null));

  return (
    <McpPanel
      className={selected ? "mcp-list-card-shell mcp-list-card-shell--selected" : "mcp-list-card-shell"}
      p={CARD_PADDING}
      gap={6}
      cursor="pointer"
      borderColor={selected ? borders.default : undefined}
      bg={selected ? surfaces.subtle : undefined}
      onPress={onPress}
      hoverStyle={{
        borderColor: borders.default,
        bg: surfaces.subtle,
      }}
      focusWithinStyle={{
        borderColor: borders.default,
        bg: surfaces.subtle,
      }}
    >
      <XStack gap={CONTENT_GAP} width="100%" items="flex-start" minW={0}>
        <McpListCardKindBadge
          kind={kind}
          connectionStatus={
            showFooterStatus && (connectionStatus === "auth" || connectionStatus === "failed")
              ? connectionStatus
              : null
          }
        />

        <YStack flex={1} minW={0} gap={3} pointerEvents="none">
          <Text
            color={colors.foreground}
            fontSize={14}
            fontWeight="600"
            numberOfLines={1}
            ellipsizeMode="tail"
            select="none"
          >
            {title}
          </Text>

          {hideDescription ? null : (
            <Text
              color={colors.muted}
              fontSize={12}
              numberOfLines={1}
              ellipsizeMode="tail"
              select="none"
              style={MCP_LIST_DESCRIPTION_STYLE}
            >
              {description}
            </Text>
          )}
        </YStack>
      </XStack>

      <XStack
        width="100%"
        justify="space-between"
        items="center"
        gap={8}
        pl={MCP_LIST_CARD_BADGE_WIDTH + CONTENT_GAP}
        pointerEvents="box-none"
      >
        {showFooterStatus ? (
          <XStack
            flex={1}
            minW={0}
            pointerEvents="box-none"
            onPress={(event) => event.stopPropagation()}
          >
            <McpListCardConnectionLabel
              status={connectionStatus}
              onSignIn={onSignIn}
              onReadMore={onReadMore}
              alwaysShowReadMore={alwaysShowReadMore}
              readMoreTextOnly={readMoreTextOnly}
            />
          </XStack>
        ) : (
          <XStack flex={1} />
        )}

        <XStack shrink={0} pointerEvents="auto" onPress={(event) => event.stopPropagation()}>
          {actions}
        </XStack>
      </XStack>
    </McpPanel>
  );
}
