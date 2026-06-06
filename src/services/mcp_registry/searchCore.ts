import type { McpServerEntry } from "./types";

export function normalizeSearch(search: string): string {
  return search.trim().toLowerCase();
}

export function entryKey(entry: McpServerEntry): string {
  return `${entry.server.name}:${entry.server.version}`;
}

export type MatchRank = {
  index: number;
  viaTitle: boolean;
};

function isBetterRank(
  index: number,
  viaTitle: boolean,
  current: MatchRank,
): boolean {
  if (index < current.index) {
    return true;
  }
  if (index > current.index) {
    return false;
  }
  return viaTitle && !current.viaTitle;
}

function displayTitle(entry: McpServerEntry): string {
  return entry.server.title ?? entry.server.name;
}

export function getMatchRank(
  entry: McpServerEntry,
  search: string,
): MatchRank | null {
  const query = normalizeSearch(search);
  if (!query) {
    return { index: 0, viaTitle: true };
  }

  let best: MatchRank | null = null;

  const consider = (value: string, viaTitle: boolean) => {
    const index = value.toLowerCase().indexOf(query);
    if (index === -1) {
      return;
    }

    if (!best || isBetterRank(index, viaTitle, best)) {
      best = { index, viaTitle };
    }
  };

  if (entry.server.title) {
    consider(entry.server.title, true);
  }

  if (entry.server.name) {
    consider(entry.server.name, false);
    const slashIndex = entry.server.name.lastIndexOf("/");
    if (slashIndex >= 0 && slashIndex < entry.server.name.length - 1) {
      consider(entry.server.name.slice(slashIndex + 1), false);
    }
  }

  return best;
}

export function getMatchScore(
  entry: McpServerEntry,
  search: string,
): number | null {
  return getMatchRank(entry, search)?.index ?? null;
}

export function matchesSearch(entry: McpServerEntry, search: string): boolean {
  return getMatchRank(entry, search) !== null;
}

export function compareSearchRelevance(
  a: McpServerEntry,
  b: McpServerEntry,
  search: string,
): number {
  const rankA = getMatchRank(a, search);
  const rankB = getMatchRank(b, search);

  if (!rankA && !rankB) {
    return 0;
  }
  if (!rankA) {
    return 1;
  }
  if (!rankB) {
    return -1;
  }

  if (rankA.index !== rankB.index) {
    return rankA.index - rankB.index;
  }

  if (rankA.viaTitle !== rankB.viaTitle) {
    return rankB.viaTitle ? 1 : -1;
  }

  return displayTitle(a).localeCompare(displayTitle(b));
}

export function filterAndSortEntries(
  entries: McpServerEntry[],
  search: string,
): McpServerEntry[] {
  const query = normalizeSearch(search);
  if (!query) {
    return [...entries];
  }

  return entries
    .filter((entry) => matchesSearch(entry, search))
    .sort((a, b) => compareSearchRelevance(a, b, search));
}

export function mergeUniqueEntries(
  existing: McpServerEntry[],
  incoming: McpServerEntry[],
): McpServerEntry[] {
  const seen = new Set(existing.map(entryKey));
  const merged = [...existing];

  for (const entry of incoming) {
    const key = entryKey(entry);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(entry);
    }
  }

  return merged;
}

export function sortEntriesByRelevance(
  entries: McpServerEntry[],
  search: string,
): McpServerEntry[] {
  const query = normalizeSearch(search);
  if (!query) {
    return [...entries];
  }

  return [...entries].sort((a, b) => compareSearchRelevance(a, b, search));
}
