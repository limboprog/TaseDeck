import type { McpServerEntry } from "../mcp_registry";
import {
  collectPackageConfigInputs,
  type ConfigInput,
  type ParsedLocalSetup,
} from "../mcp_registry/parser";

export function createDefaultInputValues(inputs: ConfigInput[]) {
  const values: Record<string, string> = {};
  for (const input of inputs) {
    if (input.defaultValue) {
      values[input.id] = input.defaultValue;
    }
  }
  return values;
}

export function resolveInstallConfigInputs(
  entry: McpServerEntry,
  localSetup: ParsedLocalSetup,
) {
  if (localSetup.inputs.length > 0) {
    return localSetup.inputs;
  }

  const pkg = entry.server.packages?.[0];
  return pkg ? collectPackageConfigInputs(pkg) : [];
}
