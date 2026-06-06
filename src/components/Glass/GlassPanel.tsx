import type { CSSProperties, ReactNode } from "react";
import { YStack, type YStackProps } from "tamagui";
import { usePanelChrome } from "../../preferences/usePanelChrome";

type GlassPanelProps = YStackProps & {
  children: ReactNode;
  glow?: boolean;
};

export function GlassPanel({
  children,
  glow = false,
  rounded = 12,
  overflow = "hidden",
  borderWidth = 1,
  borderColor,
  position = "relative",
  style,
  ...rest
}: GlassPanelProps) {
  const { liquidGlass, borderColor: chromeBorder, surfaceStyle, glowStyle } =
    usePanelChrome();

  return (
    <YStack
      position={position}
      rounded={rounded}
      overflow={overflow}
      borderWidth={borderWidth}
      borderColor={borderColor ?? chromeBorder}
      style={{ ...surfaceStyle, ...(style as CSSProperties | undefined) }}
      {...rest}
    >
      {liquidGlass && glow ? (
        <YStack
          fullscreen
          rounded={rounded}
          pointerEvents="none"
          style={glowStyle}
        />
      ) : null}
      {children}
    </YStack>
  );
}
