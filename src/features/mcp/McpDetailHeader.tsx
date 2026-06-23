import type { ReactNode } from "react";
import { IoRefresh } from "../../icons";
import { Button, Text, XStack } from "tamagui";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import type { McpServerEntry } from "../../services/mcp_registry";
import { colors, tamaguiSurfaces } from "../../theme";
import { McpAddButton } from "./McpAddButton";
import { McpRemoveButton } from "./McpRemoveButton";

const ACTION_SIZE = 30;

type McpDetailHeaderProps = {
  title: string;
  entry?: McpServerEntry | null;
  installed?: boolean;
  onInstalled?: (server: InstalledMcpServer) => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  onCreate?: () => void;
  refreshing?: boolean;
  saving?: boolean;
  showCreate?: boolean;
  deleteLabel?: string;
};

function IconActionButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      unstyled
      width={ACTION_SIZE}
      height={ACTION_SIZE}
      rounded={8}
      hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
      disabled={disabled}
      opacity={disabled ? 0.45 : 1}
      onPress={onPress}
      aria-label={label}
    >
      <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
        {children}
      </XStack>
    </Button>
  );
}

export function McpDetailHeader({
  title,
  entry,
  installed = false,
  onInstalled,
  onRefresh,
  onDelete,
  onCreate,
  refreshing = false,
  saving = false,
  showCreate = false,
  deleteLabel = "Delete server",
}: McpDetailHeaderProps) {
  return (
    <XStack width="100%" items="center" gap={12} shrink={0}>
      <Text
        flex={1}
        minW={0}
        color={colors.foreground}
        fontSize={22}
        fontWeight="700"
        letterSpacing={-0.02}
        numberOfLines={2}
        select="none"
      >
        {title}
      </Text>

      <XStack gap={6} shrink={0} items="center">
        {showCreate ? (
          <Button
            height={ACTION_SIZE}
            px={12}
            rounded={999}
            disabled={saving}
            opacity={saving ? 0.45 : 1}
            bg={colors.accent}
            color="#fff"
            fontSize={12}
            fontWeight={500}
            onPress={onCreate}
          >
            {saving ? "…" : "Create"}
          </Button>
        ) : null}

        {!showCreate && installed ? (
          <>
            <IconActionButton
              label="Refresh server"
              disabled={refreshing || saving}
              onPress={onRefresh}
            >
              <IoRefresh size={16} />
            </IconActionButton>
            <McpRemoveButton ariaLabel={deleteLabel} onClick={() => onDelete?.()} />
          </>
        ) : null}

        {!showCreate && !installed && entry ? (
          <McpAddButton entry={entry} onAdded={onInstalled} />
        ) : null}
      </XStack>
    </XStack>
  );
}
