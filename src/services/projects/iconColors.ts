export const PROJECT_ICON_COLORS = [
  "#FF5F56",
  "#FFBD2E",
  "#27C93F",
  "#007AFF",
  "#98989D",
] as const;

export type ProjectIconColor = (typeof PROJECT_ICON_COLORS)[number];

export function isProjectIconColor(value: string): value is ProjectIconColor {
  return (PROJECT_ICON_COLORS as readonly string[]).includes(value);
}

export function pickRandomProjectIconColor(): ProjectIconColor {
  const index = Math.floor(Math.random() * PROJECT_ICON_COLORS.length);
  return PROJECT_ICON_COLORS[index] ?? PROJECT_ICON_COLORS[0];
}

export function resolveProjectIconColor(value: string | undefined): ProjectIconColor {
  if (value && isProjectIconColor(value)) {
    return value;
  }
  return pickRandomProjectIconColor();
}
