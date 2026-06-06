import type { CSSProperties } from "react";
import {
  borders,
  colors,
  glassGlowStyle,
  glassSurfaceStyle,
  solidPanelSurfaceStyle,
} from "../theme";
import { useSurfaceMode } from "./SurfaceModeContext";

export function usePanelChrome() {
  const { liquidGlass } = useSurfaceMode();

  const borderColor = liquidGlass ? colors.glassBorder : borders.default;
  const surfaceStyle: CSSProperties = liquidGlass
    ? glassSurfaceStyle
    : solidPanelSurfaceStyle;

  return {
    liquidGlass,
    borderColor,
    surfaceStyle,
    glowStyle: glassGlowStyle,
  };
}
