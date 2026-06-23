/** Shared layout class names — see `styles/layout.css`. */
export const layoutClasses = {
  stack: "td-stack",
  clip: "td-clip",
  scrollY: "td-scroll-y",
  scroll: "td-scroll",
  scrollX: "td-scroll-x",
} as const;

export function mergeLayoutClass(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Shared insets for full-width pages inside AppShell (matches MCP / Topology). */
export const pageContentInsets = {
  px: 10,
  py: 8,
} as const;
