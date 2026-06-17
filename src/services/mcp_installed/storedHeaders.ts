export const HEADERS_CONFIG_KEY = "__headers";

export type HeaderVariableRow = {
  id: string;
  name: string;
  value: string;
};

function createStoredId() {
  return `header-row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** `header:Authorization` or legacy `header:0:Authorization` → `Authorization`. */
export function headerNameFromConfigKey(key: string): string | null {
  if (!key.startsWith("header:")) {
    return null;
  }
  const rest = key.slice("header:".length);
  const legacy = rest.match(/^(\d+):(.+)$/);
  if (legacy?.[2]?.trim()) {
    return legacy[2].trim();
  }
  const trimmed = rest.trim();
  return trimmed || null;
}

export function canonicalHeaderId(name: string): string {
  return `header:${name.trim()}`;
}

export function createEmptyHeaderRow(): HeaderVariableRow {
  return {
    id: createStoredId(),
    name: "",
    value: "",
  };
}

export function parseStoredHeaderRows(
  values: Record<string, string>,
): HeaderVariableRow[] {
  const raw = values[HEADERS_CONFIG_KEY];
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as HeaderVariableRow[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry) => entry && typeof entry.name === "string")
          .map((entry) => {
            const rawName = entry.name;
            const trimmedName = rawName.trim();
            if (!trimmedName) {
              return {
                id: entry.id || createStoredId(),
                name: "",
                value: entry.value ?? "",
              };
            }
            const name = headerNameFromConfigKey(rawName) ?? trimmedName;
            return {
              id: entry.id || createStoredId(),
              name,
              value: entry.value ?? "",
            };
          });
      }
    } catch {
      /* fall through */
    }
  }

  const rows: HeaderVariableRow[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(values)) {
    const name = headerNameFromConfigKey(key);
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    rows.push({
      id: canonicalHeaderId(name),
      name,
      value,
    });
  }
  return rows;
}

export function serializeStoredHeaderRows(rows: HeaderVariableRow[]): string {
  const payload = rows.map((row) => ({
    id: row.id,
    name: row.name,
    value: row.value,
  }));
  return JSON.stringify(payload);
}

export function headerValuesFromRows(
  baseValues: Record<string, string>,
  rows: HeaderVariableRow[],
): Record<string, string> {
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(baseValues)) {
    if (key.startsWith("header:")) {
      continue;
    }
    next[key] = value;
  }

  next[HEADERS_CONFIG_KEY] = serializeStoredHeaderRows(rows);

  for (const row of rows) {
    const name = row.name.trim();
    if (!name) {
      continue;
    }
    next[canonicalHeaderId(name)] = row.value;
  }

  return next;
}
