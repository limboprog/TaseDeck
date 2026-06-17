import type { CSSProperties, ReactNode } from "react";
import { YStack, type YStackProps } from "tamagui";
import { usePanelChrome } from "../../preferences/usePanelChrome";
import { layoutClasses, mergeLayoutClass } from "../../styles/layout";

type GlassPanelProps = YStackProps & {
  children: ReactNode;
  glow?: boolean;
  /** When false, children can use `position: sticky` (no overflow clip). */
  clip?: boolean;
};

export function GlassPanel({
  children,
  glow = false,
  clip = true,
  rounded = 12,
  overflow = "hidden",
  borderWidth = 1,
  borderColor,
  position = "relative",
  className,
  style,
  ...rest
}: GlassPanelProps) {
  const { liquidGlass, borderColor: chromeBorder, surfaceStyle, glowStyle } =
    usePanelChrome();

  return (
    <YStack
      className={mergeLayoutClass(clip ? layoutClasses.clip : undefined, className)}
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
