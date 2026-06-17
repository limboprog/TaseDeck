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
