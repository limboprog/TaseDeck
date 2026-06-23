export function folderBaseName(path: string): string {
  const normalized = path.trim().replace(/[/\\]+$/, "");
  if (!normalized) {
    return path.trim() || "Project";
  }
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || normalized;
}
