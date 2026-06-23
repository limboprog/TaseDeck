import { IoAdd } from "../../icons";
import { Text, XStack } from "tamagui";
import { colors, tamaguiSurfaces } from "../../theme";
import { SIDEBAR_NAV_ITEM_PY, iconButtonPadLeft } from "./sidebarStyles";

const SUB_ITEM_ICON_SIZE = 18;
const SUB_ITEM_ICON_GAP = 10;

type SidebarAgentAddButtonProps = {
  collapsed: boolean;
  onPress: () => void;
};

export function SidebarAgentAddButton({ collapsed, onPress }: SidebarAgentAddButtonProps) {
  const tone = colors.muted;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onPress}
        aria-label="Add"
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
          background: "transparent",
          color: tone,
          cursor: "pointer",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = tamaguiSurfaces.controlBg;
          event.currentTarget.style.color = colors.foreground;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "transparent";
          event.currentTarget.style.color = tone;
        }}
      >
        <IoAdd size={SUB_ITEM_ICON_SIZE} color="currentColor" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onPress}
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
        background: "transparent",
        color: tone,
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
        <IoAdd size={SUB_ITEM_ICON_SIZE} color="currentColor" />
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
        Add
      </Text>
    </button>
  );
}
