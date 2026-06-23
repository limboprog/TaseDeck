import type { CSSProperties } from "react";
import { useThemeMode } from "../../preferences/ThemeContext";
import type { AgentKind } from "./types";
import {
  AGENT_LOGO_DARK_THEME_FILTER,
  agentBrandLogoSrc,
  isAgentDarkMonochromeLogo,
} from "./agentBrandLogos";

type AgentBrandLogoProps = {
  kind: AgentKind | string;
  size?: number;
  style?: CSSProperties;
};

export function AgentBrandLogo({ kind, size = 18, style }: AgentBrandLogoProps) {
  const { isLight } = useThemeMode();
  const src = agentBrandLogoSrc(kind as AgentKind);
  if (!src) {
    return null;
  }

  const invertInDark = !isLight && isAgentDarkMonochromeLogo(kind);

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
        filter: invertInDark ? AGENT_LOGO_DARK_THEME_FILTER : undefined,
        ...style,
      }}
    />
  );
}
