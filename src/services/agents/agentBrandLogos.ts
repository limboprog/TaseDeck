import type { AgentKind } from "./types";
import antigravityLogo from "../../assets/antigravity-color.svg";
import claudeLogo from "../../assets/claude-color.svg";
import codexLogo from "../../assets/codex-color.svg";
import copilotLogo from "../../assets/githubcopilot.svg";
import cursorLogo from "../../assets/cursor.svg";
import opencodeLogo from "../../assets/opencode.svg";
import windsurfLogo from "../../assets/windsurf.svg";

const AGENT_BRAND_LOGOS: Record<string, string> = {
  antigravity: antigravityLogo,
  "claude-code": claudeLogo,
  "codex-cli": codexLogo,
  copilot: copilotLogo,
  cursor: cursorLogo,
  opencode: opencodeLogo,
  windsurf: windsurfLogo,
};

/** Monochrome (dark) brand marks — inverted to white in dark theme. */
const AGENT_DARK_MONOCHROME_KINDS = new Set<AgentKind>([
  "cursor",
  "copilot",
  "opencode",
  "windsurf",
]);

export function agentBrandLogoSrc(kind: AgentKind): string | null {
  return AGENT_BRAND_LOGOS[kind] ?? null;
}

export function isAgentDarkMonochromeLogo(kind: AgentKind | string): boolean {
  return AGENT_DARK_MONOCHROME_KINDS.has(kind as AgentKind);
}

export const AGENT_LOGO_DARK_THEME_FILTER = "brightness(0) invert(1)";
