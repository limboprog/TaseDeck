import { Text, YStack } from "tamagui";
import type { McpServerEntry } from "../../services/mcp_registry";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import { colors } from "../../theme";

export const DEFAULT_MCP_SERVER_DESCRIPTION =
  "MCP server for extending agent capabilities with external tools and data.";

export function getRegistryServerTitle(entry: McpServerEntry) {
  return entry.server.title ?? entry.server.name;
}

export function getRegistryServerDescription(entry: McpServerEntry) {
  return entry.server.description?.trim() || DEFAULT_MCP_SERVER_DESCRIPTION;
}

export function getInstalledServerTitle(
  server: InstalledMcpServer,
  entry?: McpServerEntry | null,
) {
  if (entry) {
    return getRegistryServerTitle(entry);
  }
  return server.name.trim() || "Untitled server";
}

export function getInstalledServerDescription(
  _server: InstalledMcpServer,
  entry?: McpServerEntry | null,
) {
  if (entry) {
    return getRegistryServerDescription(entry);
  }
  return DEFAULT_MCP_SERVER_DESCRIPTION;
}

/** Single-line ellipsis for list cards. */
export const MCP_LIST_DESCRIPTION_STYLE = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
  lineHeight: "18px",
};

type McpServerSummaryProps = {
  title: string;
  description: string;
  size?: "card" | "detail";
};

export function McpServerSummary({
  title,
  description,
  size = "detail",
}: McpServerSummaryProps) {
  const isDetail = size === "detail";

  return (
    <YStack gap={isDetail ? 8 : 6} width="100%" shrink={0}>
      <Text
        color={colors.foreground}
        fontSize={isDetail ? 22 : 14}
        fontWeight={isDetail ? "700" : "600"}
        letterSpacing={isDetail ? -0.02 : 0}
        numberOfLines={isDetail ? 2 : 1}
        select="none"
      >
        {title}
      </Text>
      <Text
        color={colors.muted}
        fontSize={isDetail ? 14 : 12}
        lineHeight={isDetail ? 22 : 18}
        select="none"
      >
        {description}
      </Text>
    </YStack>
  );
}
