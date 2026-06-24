import type { MouseEvent, ReactNode } from "react";
import { HiOutlineSparkles } from "../../icons";
import { Text, XStack } from "tamagui";
import { colors, tamaguiSurfaces } from "../../theme";
import { SIDEBAR_NAV_ITEM_PY, iconButtonPadLeft } from "./sidebarStyles";

const SUB_ITEM_ICON_SIZE = 18;
const SUB_ITEM_ICON_GAP = 10;

type SidebarNavSubItemProps = {
  label: string;
  logoSrc?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  icon?: ReactNode;
  active: boolean;
  collapsed: boolean;
  onPress: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
};

function SubItemIcon({
  logoSrc,
  leading,
  icon,
}: {
  logoSrc?: string | null;
  leading?: ReactNode;
  icon?: ReactNode;
}) {
  if (leading) {
    return <>{leading}</>;
  }
  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt=""
        aria-hidden
        style={{
          width: SUB_ITEM_ICON_SIZE,
          height: SUB_ITEM_ICON_SIZE,
          objectFit: "contain",
          display: "block",
        }}
      />
    );
  }
  if (icon) {
    return <>{icon}</>;
  }
  return <HiOutlineSparkles size={SUB_ITEM_ICON_SIZE} color={colors.muted} aria-hidden />;
}

export function SidebarNavSubItem({
  label,
  logoSrc,
  leading,
  trailing,
  icon,
  active,
  collapsed,
  onPress,
  onContextMenu,
}: SidebarNavSubItemProps) {
  const tone = active ? colors.foreground : colors.muted;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onPress}
        onContextMenu={onContextMenu}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          paddingTop: SIDEBAR_NAV_ITEM_PY,
          paddingBottom: SIDEBAR_NAV_ITEM_PY,
          paddingLeft: iconButtonPadLeft(true),
          paddingRight: iconButtonPadLeft(true),
          border: "none",
          borderRadius: 8,
          background: active ? tamaguiSurfaces.controlHoverBg : "transparent",
          cursor: "pointer",
        }}
        onMouseEnter={(event) => {
          if (!active) {
            event.currentTarget.style.background = tamaguiSurfaces.controlBg;
          }
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = active
            ? tamaguiSurfaces.controlHoverBg
            : "transparent";
        }}
      >
        <SubItemIcon logoSrc={logoSrc} leading={leading} icon={icon} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onPress}
      onContextMenu={onContextMenu}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        gap: SUB_ITEM_ICON_GAP,
        paddingTop: SIDEBAR_NAV_ITEM_PY,
        paddingBottom: SIDEBAR_NAV_ITEM_PY,
        paddingLeft: iconButtonPadLeft(false),
        paddingRight: 10,
        border: "none",
        borderRadius: 8,
        background: active ? tamaguiSurfaces.controlHoverBg : "transparent",
        color: tone,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
      onMouseEnter={(event) => {
        if (!active) {
          event.currentTarget.style.background = tamaguiSurfaces.controlBg;
          event.currentTarget.style.color = colors.foreground;
        }
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = active
          ? tamaguiSurfaces.controlHoverBg
          : "transparent";
        event.currentTarget.style.color = tone;
      }}
    >
      <XStack
        width={SUB_ITEM_ICON_SIZE}
        height={SUB_ITEM_ICON_SIZE}
        shrink={0}
        items="center"
        justify="center"
      >
        <SubItemIcon logoSrc={logoSrc} leading={leading} icon={icon} />
      </XStack>
      <Text
        color="inherit"
        fontSize={15}
        fontWeight="400"
        flex={1}
        overflow="hidden"
        whiteSpace="nowrap"
        text="left"
        select="none"
      >
        {label}
      </Text>
      {trailing ? <XStack shrink={0}>{trailing}</XStack> : null}
    </button>
  );
}
