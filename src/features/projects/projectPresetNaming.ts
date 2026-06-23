export const DRAFT_PRESET_PREFIX = "Draft · ";

export function buildDraftPresetName(agentName: string): string {
  return `${DRAFT_PRESET_PREFIX}${agentName}`;
}

export function isDraftPresetName(name: string): boolean {
  return name.startsWith(DRAFT_PRESET_PREFIX);
}

export function defaultSavedPresetName(name: string): string {
  return isDraftPresetName(name) ? name.slice(DRAFT_PRESET_PREFIX.length) : name;
}
