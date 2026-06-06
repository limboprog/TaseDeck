import type { ReactNode } from "react";
import {
  BsLayoutSidebar,
  GoPerson,
  IoServerOutline,
  HiOutlineShoppingBag,
  PiHouse,
  TbTopologyRing2,
  HiOutlineSparkles,
  IoListOutline,
} from "../../icons";
import { Button, Text, XStack, YStack } from "tamagui";
import { colors, tamaguiSurfaces } from "../../theme";

const SIDEBAR_WIDTH_EXPANDED = 200;
const SIDEBAR_WIDTH_COLLAPSED = 56;
const SIDEBAR_PAD_X_EXPANDED = 12;
const SIDEBAR_PAD_X_COLLAPSED = 8;
/** Keep icons on the same X axis in expanded and collapsed modes (no center detour). */
const SIDEBAR_ICON_LEFT = 19;
/** Extra space between collapse toggle and main content when sidebar is expanded. */
const COLLAPSE_TOGGLE_RIGHT_GUTTER = 12;

function sidebarPadX(collapsed: boolean) {
  return collapsed ? SIDEBAR_PAD_X_COLLAPSED : SIDEBAR_PAD_X_EXPANDED;
}

function iconButtonPadLeft(collapsed: boolean) {
  return SIDEBAR_ICON_LEFT - sidebarPadX(collapsed);
}

/** Slide collapse toggle from icon column to the right (content-local coords). */
function collapseToggleTranslateX(collapsed: boolean) {
  if (collapsed) {
    return 0;
  }
  const padX = SIDEBAR_PAD_X_EXPANDED;
  const contentWidth = SIDEBAR_WIDTH_EXPANDED - 2 * padX;
  const baseLeft = iconButtonPadLeft(false);
  const targetLeft = contentWidth - 18 - COLLAPSE_TOGGLE_RIGHT_GUTTER;
  return targetLeft - baseLeft;
}

export type NavId =
  | "dashboard"
  | "workspace"
  | "usage"
  | "agents"
  | "mcp"
  | "market"
  | "profile";

type NavItem = {
  id: NavId;
  label: string;
  icon: ReactNode;
};

const mainNavItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <PiHouse size={18} /> },
  { id: "workspace", label: "Topology", icon: <TbTopologyRing2 size={18} /> },
  { id: "usage", label: "Usage", icon: <IoListOutline size={18} /> },
  { id: "agents", label: "Agents", icon: <HiOutlineSparkles size={18} /> },
  { id: "mcp", label: "MCP", icon: <IoServerOutline size={18} /> },
  { id: "market", label: "Market", icon: <HiOutlineShoppingBag size={18} /> },
];

const profileItem: NavItem = {
  id: "profile",
  label: "Profile",
  icon: <GoPerson size={18} />,
};

type SidebarProps = {
  activeId: NavId;
  onNavigate: (id: NavId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function NavButton({
  item,
  activeId,
  onNavigate,
  collapsed,
}: {
  item: NavItem;
  activeId: NavId;
  onNavigate: (id: NavId) => void;
  collapsed: boolean;
}) {
  const isActive = activeId === item.id;
  const tone = isActive ? colors.foreground : colors.muted;

  return (
    <Button
      unstyled
      width="100%"
      py={8}
      pl={iconButtonPadLeft(collapsed)}
      pr={collapsed ? iconButtonPadLeft(collapsed) : 10}
      rounded={8}
      bg={isActive ? tamaguiSurfaces.controlHoverBg : "transparent"}
      hoverStyle={{
        bg: tamaguiSurfaces.controlBg,
      }}
      pressStyle={{
        bg: tamaguiSurfaces.controlHoverBg,
      }}
      onPress={() => onNavigate(item.id)}
      aria-current={isActive ? "page" : undefined}
      aria-label={item.label}
    >
      <XStack width="100%" items="center" justify="flex-start" gap={collapsed ? 0 : 10}>
        <XStack width={18} shrink={0} items="center" justify="center" style={{ color: tone }}>
          {item.icon}
        </XStack>
        <Text
          color={tone}
          fontSize={15}
          fontWeight="400"
          text="left"
          flex={1}
          overflow="hidden"
          whiteSpace="nowrap"
          opacity={collapsed ? 0 : 1}
          maxW={collapsed ? 0 : 160}
          pointerEvents={collapsed ? "none" : "auto"}
          hoverStyle={{ color: colors.foreground }}
          style={{
            transition: "opacity 0.15s ease, max-width 0.2s ease",
          }}
        >
          {item.label}
        </Text>
      </XStack>
    </Button>
  );
}

export function Sidebar({
  activeId,
  onNavigate,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const padX = sidebarPadX(collapsed);

  return (
    <YStack
      shrink={0}
      pt={12}
      pb={16}
      justify="space-between"
      height="100%"
      items="stretch"
      aria-label="Navigation"
      style={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
        paddingLeft: padX,
        paddingRight: padX,
        transition: "width 0.2s ease, padding 0.2s ease",
      }}
    >
      <YStack gap={8} width="100%" items="stretch">
        <XStack width="100%" position="relative" pb={4} style={{ height: 22 }}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              position: "absolute",
              top: 0,
              left: iconButtonPadLeft(collapsed),
              transform: `translateX(${collapseToggleTranslateX(collapsed)}px)`,
              transition: "transform 0.2s ease, left 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              border: "none",
              background: "transparent",
              color: colors.muted,
              cursor: "pointer",
              padding: 0,
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = colors.foreground;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = colors.muted;
            }}
          >
            <BsLayoutSidebar size={18} />
          </button>
        </XStack>

        <YStack gap={2} width="100%" items="stretch">
          {mainNavItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              activeId={activeId}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          ))}
        </YStack>
      </YStack>

      <YStack pt={16} width="100%" items="stretch">
        <NavButton
          item={profileItem}
          activeId={activeId}
          onNavigate={onNavigate}
          collapsed={collapsed}
        />
      </YStack>
    </YStack>
  );
}
