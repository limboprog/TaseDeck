import type { CSSProperties } from "react";

/**
 * App-wide design tokens (dark + light).
 * Components import `colors`, `borders`, etc. — values are CSS variables.
 * Switch scheme via `applyColorScheme` / `ThemeProvider` (Profile toggle).
 */

export type ColorScheme = "dark" | "light";

const cssVar = (name: string) => `var(${name})` as const;

/** Shared brand / status colors (both schemes). */
const shared = {
  // accent: "rgb(126, 78, 178)",
  accent: "#8B5CF6",
  error: "#EF4444",
  errorSoft: "#f87171",
  warning: "#FACC15",
  warningSoft: "#FDE047",
  success: "#4ADE80",
  star: "#FBBF24",
} as const;

const darkCssVars: Record<string, string> = {
  "--td-background": "#101112",
  "--td-page": "#121314",
  "--td-surface": "#18191b",
  "--td-command-surface": "#161719",
  "--td-command-surface-hover": "#1c1e21",
  "--td-foreground": "rgb(232, 234, 237)",
  "--td-muted": "#8B9199",
  "--td-tree-rail": "#6B7178",
  "--td-panel-foreground": "rgb(210, 213, 218)",
  "--td-border": "rgba(64, 65, 66, 0.5)",
  "--td-glass-fill-top": "rgba(24, 25, 27, 0.58)",
  "--td-glass-fill-bottom": "rgba(18, 19, 20, 0.88)",
  "--td-glass-border": "rgba(64, 65, 66, 0.45)",
  "--td-glass-inner-glow": "rgba(36, 38, 42, 0.35)",
  "--td-glass-inner-depth": "rgba(8, 9, 10, 0.45)",
  "--td-glass-edge-top": "rgba(255, 255, 255, 0.03)",
  "--td-glass-glow":
    "radial-gradient(ellipse 100% 55% at 50% 0%, rgba(42, 44, 48, 0.2) 0%, transparent 62%)",
  "--td-alpha-2": "rgba(255, 255, 255, 0.02)",
  "--td-alpha-3": "rgba(255, 255, 255, 0.03)",
  "--td-alpha-4": "rgba(255, 255, 255, 0.04)",
  "--td-alpha-5": "rgba(255, 255, 255, 0.05)",
  "--td-alpha-6": "rgba(255, 255, 255, 0.06)",
  "--td-alpha-8": "rgba(255, 255, 255, 0.08)",
  "--td-alpha-10": "rgba(255, 255, 255, 0.1)",
  "--td-alpha-12": "rgba(255, 255, 255, 0.12)",
  "--td-alpha-14": "rgba(255, 255, 255, 0.14)",
  "--td-alpha-28": "rgba(255, 255, 255, 0.28)",
  "--td-black-28": "rgba(0, 0, 0, 0.28)",
  "--td-black-35": "rgba(0, 0, 0, 0.35)",
  "--td-black-32": "rgba(0, 0, 0, 0.32)",
  "--td-shadow-shell": "0 12px 36px rgba(0, 0, 0, 0.32)",
  "--td-graph-grid":
    "radial-gradient(circle, rgba(255,255,255,0.14) 1.75px, transparent 1.8px)",
  "--td-graph-grid-dot": "rgba(255, 255, 255, 0.14)",
  "--td-graph-node-bg": "#141516",
  "--td-graph-node-header-agent": "#18191b",
  "--td-graph-node-header-mcp": "#161718",
  "--td-project-node-significant": "#2D2D30",
  "--td-project-node-functional": "#1A1A1C",
  "--td-graph-block-bg": "rgba(20, 21, 22, 0.92)",
  "--td-graph-block-border": "rgba(139, 92, 246, 0.35)",
  "--td-graph-wire-active": "rgba(140, 180, 255, 0.85)",
  "--td-graph-wire-inactive": "rgba(110, 110, 110, 0.55)",
  "--td-graph-wire-preview": "rgba(160, 210, 255, 0.95)",
  "--td-graph-highlight-border": "rgba(120, 200, 255, 0.85)",
  "--td-graph-highlight-border-dim": "rgba(120, 200, 255, 0.55)",
  "--td-graph-highlight-glow": "rgba(120, 200, 255, 0.28)",
  "--td-graph-edge-control-bg": "rgba(18, 20, 24, 0.96)",
  "--td-graph-edge-control-bg-disabled": "rgba(28, 28, 28, 0.96)",
  "--td-graph-edge-control-border": "rgba(140, 180, 255, 0.55)",
  "--td-graph-edge-control-border-disabled": "rgba(130, 130, 130, 0.45)",
  "--td-graph-icon-button-bg": "rgba(18, 20, 24, 0.96)",
  "--td-graph-icon-button-border": "rgba(140, 180, 255, 0.55)",
  "--td-graph-icon-button-border-dim": "rgba(140, 180, 255, 0.16)",
  "--td-graph-shadow": "0 8px 24px rgba(0, 0, 0, 0.45)",
  "--td-graph-shadow-strong": "0 10px 28px rgba(0, 0, 0, 0.4)",
  "--td-graph-shadow-soft": "0 2px 8px rgba(0, 0, 0, 0.28)",
  "--td-graph-edge-control-shadow": "0 4px 14px rgba(0, 0, 0, 0.35)",
  "--td-graph-marquee-fill": "rgba(139, 92, 246, 0.1)",
  "--td-market-installed-bg": "rgba(34, 197, 94, 0.18)",
  "--td-market-installed-border": "rgba(74, 222, 128, 0.38)",
  "--td-market-card-hover-shadow": "0 0 3px rgba(0, 0, 0, 0.32)",
  "--td-warning": "#FACC15",
  "--td-warning-soft": "#FDE047",
};

const lightCssVars: Record<string, string> = {
  "--td-background": "#ECEEF2",
  "--td-page": "#F4F5F8",
  "--td-surface": "#FFFFFF",
  "--td-command-surface": "#E4E6EB",
  "--td-command-surface-hover": "#D8DCE3",
  "--td-foreground": "#15171A",
  "--td-muted": "#5F6673",
  "--td-tree-rail": "#4B525E",
  "--td-panel-foreground": "#525863",
  "--td-border": "rgba(15, 17, 20, 0.12)",
  "--td-glass-fill-top": "rgba(255, 255, 255, 0.82)",
  "--td-glass-fill-bottom": "rgba(244, 245, 248, 0.96)",
  "--td-glass-border": "rgba(15, 17, 20, 0.1)",
  "--td-glass-inner-glow": "rgba(255, 255, 255, 0)",
  "--td-glass-inner-depth": "rgba(15, 17, 20, 0.04)",
  "--td-glass-edge-top": "rgba(255, 255, 255, 0.65)",
  "--td-glass-glow":
    "radial-gradient(ellipse 100% 55% at 50% 0%, rgba(255, 255, 255, 0.55) 0%, transparent 62%)",
  "--td-alpha-2": "rgba(15, 17, 20, 0.03)",
  "--td-alpha-3": "rgba(15, 17, 20, 0.04)",
  "--td-alpha-4": "rgba(15, 17, 20, 0.05)",
  "--td-alpha-5": "rgba(15, 17, 20, 0.06)",
  "--td-alpha-6": "rgba(15, 17, 20, 0.08)",
  "--td-alpha-8": "rgba(15, 17, 20, 0.1)",
  "--td-alpha-10": "rgba(15, 17, 20, 0.12)",
  "--td-alpha-12": "rgba(15, 17, 20, 0.14)",
  "--td-alpha-14": "rgba(15, 17, 20, 0.18)",
  "--td-alpha-28": "rgba(15, 17, 20, 0.28)",
  "--td-black-28": "rgba(15, 17, 20, 0.06)",
  "--td-black-35": "rgba(15, 17, 20, 0.08)",
  "--td-black-32": "rgba(15, 17, 20, 0.1)",
  "--td-shadow-shell": "0 12px 32px rgba(15, 17, 20, 0.08)",
  "--td-graph-grid":
    "radial-gradient(circle, rgba(15,17,20,0.16) 1.75px, transparent 1.8px)",
  "--td-graph-grid-dot": "rgba(15, 17, 20, 0.16)",
  "--td-graph-node-bg": "#FFFFFF",
  "--td-graph-node-header-agent": "#F4F5F8",
  "--td-graph-node-header-mcp": "#ECEEF2",
  "--td-project-node-significant": "#eceef3",
  "--td-project-node-functional": "#FFFFFF",
  "--td-graph-block-bg": "rgba(255, 255, 255, 0.96)",
  "--td-graph-block-border": "rgba(139, 92, 246, 0.28)",
  "--td-graph-wire-active": "rgba(139, 92, 246, 0.72)",
  "--td-graph-wire-inactive": "rgba(95, 102, 115, 0.42)",
  "--td-graph-wire-preview": "rgba(139, 92, 246, 0.82)",
  "--td-graph-highlight-border": "rgba(139, 92, 246, 0.62)",
  "--td-graph-highlight-border-dim": "rgba(139, 92, 246, 0.38)",
  "--td-graph-highlight-glow": "rgba(139, 92, 246, 0.16)",
  "--td-graph-edge-control-bg": "#FFFFFF",
  "--td-graph-edge-control-bg-disabled": "#ECEEF2",
  "--td-graph-edge-control-border": "rgba(139, 92, 246, 0.45)",
  "--td-graph-edge-control-border-disabled": "rgba(95, 102, 115, 0.35)",
  "--td-graph-icon-button-bg": "#FFFFFF",
  "--td-graph-icon-button-border": "rgba(139, 92, 246, 0.45)",
  "--td-graph-icon-button-border-dim": "rgba(139, 92, 246, 0.14)",
  "--td-graph-shadow": "0 8px 24px rgba(15, 17, 20, 0.1)",
  "--td-graph-shadow-strong": "0 10px 28px rgba(15, 17, 20, 0.12)",
  "--td-graph-shadow-soft": "0 2px 8px rgba(15, 17, 20, 0.08)",
  "--td-graph-edge-control-shadow": "0 4px 14px rgba(15, 17, 20, 0.1)",
  "--td-graph-marquee-fill": "rgba(139, 92, 246, 0.08)",
  "--td-market-installed-bg": "rgba(34, 197, 94, 0.14)",
  "--td-market-installed-border": "rgba(22, 163, 74, 0.35)",
  "--td-market-card-hover-shadow": "0 0 3px rgba(15, 17, 20, 0.16)",
  "--td-warning": "#CA8A04",
  "--td-warning-soft": "#EAB308",
};

const schemeVars: Record<ColorScheme, Record<string, string>> = {
  dark: darkCssVars,
  light: lightCssVars,
};

export function applyColorScheme(scheme: ColorScheme): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = scheme;
  const vars = schemeVars[scheme];
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

export const colors = {
  background: cssVar("--td-background"),
  page: cssVar("--td-page"),
  surface: cssVar("--td-surface"),
  commandSurface: cssVar("--td-command-surface"),
  commandSurfaceHover: cssVar("--td-command-surface-hover"),
  border: cssVar("--td-border"),
  foreground: cssVar("--td-foreground"),
  muted: cssVar("--td-muted"),
  treeRail: cssVar("--td-tree-rail"),
  panelForeground: cssVar("--td-panel-foreground"),
  accent: shared.accent,
  error: shared.error,
  errorSoft: shared.errorSoft,
  warning: cssVar("--td-warning"),
  warningSoft: cssVar("--td-warning-soft"),
  success: shared.success,
  glassFillTop: cssVar("--td-glass-fill-top"),
  glassFillBottom: cssVar("--td-glass-fill-bottom"),
  glassBorder: cssVar("--td-glass-border"),
  glassInnerGlow: cssVar("--td-glass-inner-glow"),
  glassInnerDepth: cssVar("--td-glass-inner-depth"),
  glassEdgeTop: cssVar("--td-glass-edge-top"),
} as const;

/** Light overlays on dark UI / dark overlays on light UI — keys unchanged. */
export const whiteAlpha = {
  2: cssVar("--td-alpha-2"),
  3: cssVar("--td-alpha-3"),
  4: cssVar("--td-alpha-4"),
  5: cssVar("--td-alpha-5"),
  6: cssVar("--td-alpha-6"),
  8: cssVar("--td-alpha-8"),
  10: cssVar("--td-alpha-10"),
  12: cssVar("--td-alpha-12"),
  14: cssVar("--td-alpha-14"),
  28: cssVar("--td-alpha-28"),
} as const;

export const blackAlpha = {
  28: cssVar("--td-black-28"),
  35: cssVar("--td-black-35"),
  32: cssVar("--td-black-32"),
} as const;

export const accentAlpha = {
  12: "rgba(139, 92, 246, 0.12)",
} as const;

export const dangerAlpha = {
  12: "rgba(255, 80, 80, 0.12)",
  15: "rgba(255, 80, 80, 0.15)",
} as const;

export const surfaces = {
  subtle: whiteAlpha[3],
  control: whiteAlpha[4],
  card: whiteAlpha[5],
  controlHover: whiteAlpha[6],
  active: whiteAlpha[8],
  controlHoverStrong: whiteAlpha[10],
  inset: blackAlpha[28],
  command: blackAlpha[35],
  disabled: whiteAlpha[2],
} as const;

export const borders = {
  faint: whiteAlpha[6],
  default: whiteAlpha[8],
  strong: whiteAlpha[10],
  focus: whiteAlpha[12],
  selected: whiteAlpha[14],
  dashed: whiteAlpha[14],
  glass: colors.glassBorder,
} as const;

export const project = {
  nodeSignificant: cssVar("--td-project-node-significant"),
  nodeFunctional: cssVar("--td-project-node-functional"),
} as const;

export const graph = {
  nodeBg: cssVar("--td-graph-node-bg"),
  nodeHeaderAgent: cssVar("--td-graph-node-header-agent"),
  nodeHeaderMcp: cssVar("--td-graph-node-header-mcp"),
  blockBg: cssVar("--td-graph-block-bg"),
  blockBorder: cssVar("--td-graph-block-border"),
  wireActive: cssVar("--td-graph-wire-active"),
  wireInactive: cssVar("--td-graph-wire-inactive"),
  wirePreview: cssVar("--td-graph-wire-preview"),
  highlightBorder: cssVar("--td-graph-highlight-border"),
  highlightBorderDim: cssVar("--td-graph-highlight-border-dim"),
  highlightGlow: cssVar("--td-graph-highlight-glow"),
  edgeControlBg: cssVar("--td-graph-edge-control-bg"),
  edgeControlBgDisabled: cssVar("--td-graph-edge-control-bg-disabled"),
  edgeControlBorder: cssVar("--td-graph-edge-control-border"),
  edgeControlBorderDisabled: cssVar("--td-graph-edge-control-border-disabled"),
  iconButtonBg: cssVar("--td-graph-icon-button-bg"),
  iconButtonBorder: cssVar("--td-graph-icon-button-border"),
  iconButtonBorderDim: cssVar("--td-graph-icon-button-border-dim"),
  shadow: cssVar("--td-graph-shadow"),
  shadowStrong: cssVar("--td-graph-shadow-strong"),
  shadowSoft: cssVar("--td-graph-shadow-soft"),
  edgeControlShadow: cssVar("--td-graph-edge-control-shadow"),
  marqueeFill: cssVar("--td-graph-marquee-fill"),
  gridDot: cssVar("--td-graph-grid-dot"),
} as const;

export const market = {
  cardHoverBg: whiteAlpha[5],
  cardHoverBorder: whiteAlpha[10],
  cardHoverShadow: cssVar("--td-market-card-hover-shadow"),
  star: shared.star,
  starMuted: whiteAlpha[14],
  installedBg: cssVar("--td-market-installed-bg"),
  installedBorder: cssVar("--td-market-installed-border"),
  installedText: colors.success,
} as const;

export const blocks = {
  paneHeader: {
    height: 48,
    paddingLeft: 12,
    paddingRight: 12,
    flexShrink: 0,
    borderBottom: `1px solid ${borders.faint}`,
  } satisfies CSSProperties,

  inputField: {
    background: surfaces.control,
    border: `1px solid ${borders.default}`,
    borderRadius: 6,
    color: colors.foreground,
    fontSize: 12,
    outline: "none",
  } satisfies CSSProperties,

  insetPanel: {
    borderRadius: 8,
    border: `1px solid ${borders.default}`,
    background: surfaces.inset,
  } satisfies CSSProperties,

  commandTerminal: {
    borderRadius: 8,
    border: `1px solid ${borders.default}`,
    background: surfaces.command,
    overflow: "hidden",
  } satisfies CSSProperties,

  commandTerminalHeader: {
    borderBottom: `1px solid ${borders.faint}`,
  } satisfies CSSProperties,

  mcpPanel: {
    borderRadius: 12,
    border: `1px solid ${borders.default}`,
    background: colors.surface,
    overflow: "hidden",
  } satisfies CSSProperties,

  shellContent: {
    borderRadius: 14,
    border: `1px solid ${borders.default}`,
    background: colors.page,
    overflow: "hidden",
  } satisfies CSSProperties,

  contextMenu: {
    border: `1px solid ${borders.focus}`,
    borderRadius: 8,
    background: colors.surface,
    boxShadow: `0 8px 24px ${blackAlpha[32]}`,
  } satisfies CSSProperties,

  graphDotGrid: cssVar("--td-graph-grid"),
  graphDotGridStep: 20,
} as const;

export const glassSurfaceStyle = {
  background: `linear-gradient(180deg, ${colors.glassFillTop} 0%, ${colors.glassFillBottom} 100%)`,
  backdropFilter: "blur(20px) saturate(105%)",
  WebkitBackdropFilter: "blur(20px) saturate(105%)",
  boxShadow: [
    `inset 0 1px 0 ${colors.glassEdgeTop}`,
    `inset 0 0 0 1px ${whiteAlpha[2]}`,
    `inset 0 0 40px ${colors.glassInnerGlow}`,
    `inset 0 0 100px ${colors.glassInnerDepth}`,
    `var(--td-shadow-shell)`,
  ].join(", "),
} as const;

export const glassGlowStyle = {
  background: cssVar("--td-glass-glow"),
} as const;

export const solidPanelSurfaceStyle = {
  background: colors.surface,
} as const;

export const shellSurfaceStyle = {
  background: colors.page,
  boxShadow: cssVar("--td-shadow-shell"),
} as const;

export const tamaguiSurfaces = {
  controlBg: surfaces.control,
  controlBorder: borders.default,
  controlHoverBg: surfaces.controlHover,
  controlHoverStrongBg: surfaces.controlHoverStrong,
  activeBg: surfaces.active,
  disabledBg: surfaces.disabled,
  accentTintBg: accentAlpha[12],
  dangerHoverBg: dangerAlpha[15],
} as const;

/** @deprecated Use `ColorScheme` — kept for readability. */
export type ThemeId = ColorScheme;

export const themes = {
  dark: darkCssVars,
  light: lightCssVars,
} as const;
