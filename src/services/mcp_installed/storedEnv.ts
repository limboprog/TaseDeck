import type { ConfigInput } from "../mcp_registry/parser";
import type { EnvVariableRow } from "./envEditor";
import { createEmptyEnvRow } from "./envEditor";

export const ENV_VARIABLES_CONFIG_KEY = "__envVariables";

export type StoredEnvVariable = {
  id: string;
  name: string;
  value: string;
  label?: string;
};

function createStoredId() {
  return `env-row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseStoredEnvRows(values: Record<string, string>): EnvVariableRow[] {
  const raw = values[ENV_VARIABLES_CONFIG_KEY];
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as StoredEnvVariable[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry) => entry && typeof entry.name === "string")
          .map((entry) => ({
            id: entry.id || createStoredId(),
            name: entry.name,
            value: entry.value ?? "",
            label: entry.label,
            isEditing: false,
          }));
      }
    } catch {
      /* fall through */
    }
  }

  const rows: EnvVariableRow[] = [];
  const seen = new Set<string>();

  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith("__")) {
      continue;
    }
    const name = key.startsWith("env:") ? key.slice(4) : key;
    if (!name.trim() || seen.has(name)) {
      continue;
    }
    seen.add(name);
    rows.push({
      id: `env:${name}`,
      name,
      value,
      isEditing: false,
    });
  }

  return rows;
}

export function serializeStoredEnvRows(rows: EnvVariableRow[]): string {
  const payload: StoredEnvVariable[] = rows
    .filter((row) => row.name.trim())
    .map((row) => ({
      id: row.id,
      name: row.name.trim(),
      value: row.value,
      label: row.label?.trim() || undefined,
    }));
  return JSON.stringify(payload);
}

export function envValuesFromRows(
  baseValues: Record<string, string>,
  rows: EnvVariableRow[],
): Record<string, string> {
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(baseValues)) {
    if (key.startsWith("__")) {
      next[key] = value;
    }
  }

  next[ENV_VARIABLES_CONFIG_KEY] = serializeStoredEnvRows(rows);

  for (const row of rows) {
    const name = row.name.trim();
    if (!name) {
      continue;
    }
    next[`env:${name}`] = row.value;
    next[name] = row.value;
  }

  return next;
}

export function envInputsFromRows(
  baseInputs: ConfigInput[],
  rows: EnvVariableRow[],
): ConfigInput[] {
  const nonEnv = baseInputs.filter((input) => input.source !== "environment");
  const envInputs: ConfigInput[] = rows
    .filter((row) => row.name.trim())
    .map((row) => ({
      id: row.id.startsWith("env:") ? row.id : `env:${row.name.trim()}`,
      name: row.name.trim(),
      description: undefined,
      isRequired: false,
      isSecret: /key|token|secret|password|credential/i.test(row.name),
      source: "environment" as const,
    }));

  const byId = new Map<string, ConfigInput>();
  for (const input of [...nonEnv, ...envInputs]) {
    byId.set(input.id, input);
  }
  return [...byId.values()];
}

export function listEnvKeysFromRows(rows: EnvVariableRow[]) {
  return [...new Set(rows.map((row) => row.name.trim()).filter(Boolean))].sort();
}

export function createNewEnvRow(): EnvVariableRow {
  return { ...createEmptyEnvRow(), isEditing: false };
}
