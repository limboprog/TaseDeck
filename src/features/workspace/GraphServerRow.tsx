import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { BsServer } from "../../icons";
import { Text, XStack } from "tamagui";
import { borders, colors, graph, surfaces, tamaguiSurfaces } from "../../theme";
import { GRAPH_SERVER_ROW_HEIGHT } from "./graphLayoutConstants";

export { GRAPH_SERVER_ROW_HEIGHT } from "./graphLayoutConstants";

export function graphServerIconButtonStyle(highlighted: boolean): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: `1px solid ${highlighted ? graph.iconButtonBorder : graph.iconButtonBorderDim}`,
    background: graph.iconButtonBg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
    color: highlighted ? colors.foreground : colors.muted,
  };
}

type GraphServerRowProps = {
  name: string;
  width: number | string;
  running?: boolean;
  highlighted?: boolean;
  borderColor?: string;
  /** Standalone node on canvas (outside block) — {@link graph.nodeBg}. */
  standalone?: boolean;
  /** Pass `null` to hide the leading icon (e.g. agent nodes). */
  icon?: ReactNode | null;
  actions?: ReactNode;
  cursor?: "grab" | "grabbing";
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onContextMenu?: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function GraphServerRow({
  name,
  width,
  running = true,
  highlighted = false,
  borderColor,
  standalone = false,
  icon,
  actions,
  cursor = "grab",
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onContextMenu,
}: GraphServerRowProps) {
  const active = running || highlighted;

  return (
    <XStack
      width={typeof width === "number" ? width : undefined}
      height={GRAPH_SERVER_ROW_HEIGHT}
      px={6}
      items="center"
      gap={6}
      rounded={8}
      borderWidth={1}
      borderColor={
        (borderColor ?? (running ? borders.focus : tamaguiSurfaces.activeBg)) as never
      }
      bg={
        (standalone
          ? graph.nodeBg
          : running
            ? tamaguiSurfaces.controlBg
            : surfaces.disabled) as never
      }
      style={{
        cursor,
        ...(typeof width === "string" ? { width } : null),
      }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onContextMenu={onContextMenu}
    >
      {icon === null ? null : (
        icon ?? (
          <BsServer
            size={15}
            color={active ? colors.accent : colors.muted}
            aria-hidden
            style={{ flexShrink: 0 }}
          />
        )
      )}

      <Text
        color={active ? colors.foreground : colors.muted}
        fontSize={12}
        fontWeight="600"
        numberOfLines={1}
        flex={1}
        select="none"
      >
        {name}
      </Text>

      {actions}
    </XStack>
  );
}
