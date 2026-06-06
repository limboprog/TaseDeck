import type { ConfigInput } from "../mcp_registry/parser";

export type EnvVariableRow = {
  id: string;
  name: string;
  value: string;
  /** Optional display label (session UI only). */
  label?: string;
  isEditing: boolean;
};

function createRowId() {
  return `env-row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function envRowsFromConfig(
  inputs: ConfigInput[],
  values: Record<string, string>,
): EnvVariableRow[] {
  const rows: EnvVariableRow[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    if (input.source !== "environment") {
      continue;
    }
    const name = input.name.trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    rows.push({
      id: input.id || `env:${name}`,
      name,
      value: values[input.id] ?? values[name] ?? "",
      isEditing: false,
    });
  }

  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith("__")) {
      continue;
    }
    const name = key.startsWith("env:") ? key.slice(4) : key;
    if (!name || seen.has(name) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
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

export function createEmptyEnvRow(): EnvVariableRow {
  return {
    id: createRowId(),
    name: "",
    value: "",
    isEditing: true,
  };
}

export function applyEnvRowsToConfig(
  rows: EnvVariableRow[],
  baseInputs: ConfigInput[],
): { values: Record<string, string>; inputs: ConfigInput[] } {
  const values: Record<string, string> = {};
  const nonEnv = baseInputs.filter((input) => input.source !== "environment");
  const envInputs: ConfigInput[] = [];

  for (const row of rows) {
    const name = row.name.trim();
    if (!name) {
      continue;
    }
    const id = `env:${name}`;
    values[id] = row.value;
    values[name] = row.value;
    envInputs.push({
      id,
      name,
      description: undefined,
      isRequired: false,
      isSecret: /key|token|secret|password|credential/i.test(name),
      source: "environment",
    });
  }

  const byId = new Map<string, ConfigInput>();
  for (const input of [...nonEnv, ...envInputs]) {
    byId.set(input.id, input);
  }

  return {
    values,
    inputs: [...byId.values()],
  };
}
