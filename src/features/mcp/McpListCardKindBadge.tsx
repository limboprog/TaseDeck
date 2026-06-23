import { CiLock, FiAlertTriangle, IoCloudOutline, PiLaptopLight } from "../../icons";
import type { McpListCardConnectionStatus } from "./mcpConnectionListStatus";
import type { McpListCardKind } from "./mcpListCardKind";
import { MCP_LIST_KIND_COLORS, MCP_LIST_KIND_ICON_COLORS } from "./mcpListCardKind";

const BADGE_SIZE = 36;
const KIND_ICON_SIZE = 20;
const MIXED_LAPTOP_ICON_SIZE = 18;
const MIXED_CLOUD_ICON_SIZE = 11;
const BADGE_TITLE_TOP_OFFSET = 3;

const CONNECTION_BADGE = {
  failed: {
    background: "#FF9C00",
    iconColor: "#9A3412",
  },
  auth: {
    background: "#D5DCE7",
    iconColor: "#4B5563",
  },
} as const;

const badgeRootStyle = {
  flexShrink: 0,
  alignSelf: "flex-start" as const,
  marginTop: BADGE_TITLE_TOP_OFFSET,
  pointerEvents: "none" as const,
};

type McpListCardKindBadgeProps = {
  kind: McpListCardKind;
  connectionStatus?: McpListCardConnectionStatus | null;
};

export function McpListCardKindBadge({
  kind,
  connectionStatus = null,
}: McpListCardKindBadgeProps) {
  if (connectionStatus === "failed") {
    return (
      <div
        aria-hidden
        style={{
          ...badgeRootStyle,
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderRadius: 999,
          background: CONNECTION_BADGE.failed.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: CONNECTION_BADGE.failed.iconColor,
        }}
      >
        <FiAlertTriangle size={19} />
      </div>
    );
  }

  if (connectionStatus === "auth") {
    return (
      <div
        aria-hidden
        style={{
          ...badgeRootStyle,
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderRadius: 999,
          background: CONNECTION_BADGE.auth.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: CONNECTION_BADGE.auth.iconColor,
        }}
      >
        <CiLock size={20} />
      </div>
    );
  }

  const background = MCP_LIST_KIND_COLORS[kind];
  const iconColor = MCP_LIST_KIND_ICON_COLORS[kind];

  if (kind === "mixed") {
    return (
      <div
        aria-hidden
        style={{
          ...badgeRootStyle,
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderRadius: 999,
          background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            color: iconColor,
            lineHeight: 0,
          }}
        >
          <PiLaptopLight size={MIXED_LAPTOP_ICON_SIZE} />
          <div
            style={{
              position: "absolute",
              right: -2,
              bottom: -1,
              display: "flex",
              color: iconColor,
            }}
          >
            <IoCloudOutline size={MIXED_CLOUD_ICON_SIZE} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      style={{
        ...badgeRootStyle,
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        borderRadius: 999,
        background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: iconColor,
      }}
    >
      {kind === "local" ? (
        <PiLaptopLight size={KIND_ICON_SIZE} />
      ) : (
        <IoCloudOutline size={KIND_ICON_SIZE} />
      )}
    </div>
  );
}

export const MCP_LIST_CARD_BADGE_WIDTH = BADGE_SIZE;
