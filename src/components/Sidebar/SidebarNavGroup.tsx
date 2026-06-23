import type { ReactNode } from "react";
import { Text, YStack } from "tamagui";
import { ToolbarChevron } from "../toolbar/ToolbarChevron";
import { colors, tamaguiSurfaces } from "../../theme";
import {
  SIDEBAR_NAV_BLOCK_GAP,
  SIDEBAR_NAV_ITEM_PY,
  iconButtonPadLeft,
} from "./sidebarStyles";

type SidebarNavGroupProps = {
  title: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  collapsed: boolean;
  children: ReactNode;
};

export function SidebarNavGroup({
  title,
  expanded,
  onExpandedChange,
  collapsed,
  children,
}: SidebarNavGroupProps) {
  return (
    <div
      style={{
        width: "100%",
        marginTop: SIDEBAR_NAV_BLOCK_GAP,
        marginBottom: SIDEBAR_NAV_BLOCK_GAP,
      }}
    >
      {!collapsed ? (
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            paddingTop: SIDEBAR_NAV_ITEM_PY,
            paddingBottom: SIDEBAR_NAV_ITEM_PY,
            paddingLeft: iconButtonPadLeft(false),
            paddingRight: 10,
            border: "none",
            borderRadius: 8,
            background: "transparent",
            color: colors.muted,
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = tamaguiSurfaces.controlBg;
            event.currentTarget.style.color = colors.foreground;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = "transparent";
            event.currentTarget.style.color = colors.muted;
          }}
        >
          <Text
            color="inherit"
            fontSize={15}
            fontWeight="500"
            text="left"
            overflow="hidden"
            whiteSpace="nowrap"
            select="none"
            shrink={0}
          >
            {title}
          </Text>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginLeft: 6,
            }}
          >
            <ToolbarChevron expanded={expanded} size={12} variant="disclosure" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }} />
        </button>
      ) : null}

      {!collapsed ? (
        <div className="mcp-list-collapsible-body" data-expanded={expanded ? "true" : "false"}>
          <div className="mcp-list-collapsible-inner">
            <YStack gap={2} width="100%">
              {children}
            </YStack>
          </div>
        </div>
      ) : expanded ? (
        <YStack gap={2} width="100%">
          {children}
        </YStack>
      ) : null}
    </div>
  );
}
