import type { ReactNode } from "react";
import { IoRefresh } from "../../icons";
import { Button, XStack } from "tamagui";
import type { McpServerEntry } from "../../services/mcp_registry";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import { colors, tamaguiSurfaces } from "../../theme";
import { McpAddButton } from "./McpAddButton";
import { McpRemoveButton } from "./McpRemoveButton";

const COMPACT_SIZE = 26;

function CompactIconButton({
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
      width={COMPACT_SIZE}
      height={COMPACT_SIZE}
      rounded={6}
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

type McpListCardActionsProps = {
  entry?: McpServerEntry | null;
  installedServer?: InstalledMcpServer | null;
  onInstalled?: (server: InstalledMcpServer) => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  refreshing?: boolean;
  deleteLabel?: string;
  hideRefresh?: boolean;
};

export function McpListCardActions({
  entry,
  installedServer,
  onInstalled,
  onRefresh,
  onDelete,
  refreshing = false,
  deleteLabel = "Delete server",
  hideRefresh = false,
}: McpListCardActionsProps) {
  if (installedServer) {
    return (
      <XStack gap={4} items="center" shrink={0}>
        {!hideRefresh ? (
          <CompactIconButton
            label="Refresh server"
            disabled={refreshing}
            onPress={onRefresh}
          >
            <IoRefresh size={14} />
          </CompactIconButton>
        ) : null}
        {onDelete ? <McpRemoveButton ariaLabel={deleteLabel} onClick={() => onDelete?.()} /> : null}
      </XStack>
    );
  }

  if (entry) {
    return <McpAddButton entry={entry} compact onAdded={onInstalled} />;
  }

  return null;
}
