#!/usr/bin/env node
/**
 * Batch market probe — runs the Tauri/Rust pipeline (same as Market → Add):
 *   build_registry_install_plan → run commands / config / analysis → Initialize + List probes
 *
 * Usage:
 *   node test/run-market-probes.mjs --top 10
 *   node test/run-market-probes.mjs --input test/tests.json
 *   node test/run-market-probes.mjs --input test/tests.json --install
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const tauriDir = join(projectRoot, "src-tauri");

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const outputPath =
  outputIndex >= 0 && args[outputIndex + 1]
    ? args[outputIndex + 1]
    : join(__dirname, "result.json");

const cargoArgs = ["run", "--quiet", "--bin", "market-probe", "--"];
if (!args.some((arg) => arg === "--output")) {
  cargoArgs.push("--output", outputPath);
}
cargoArgs.push(...args);

const result = spawnSync("cargo", cargoArgs, {
  cwd: tauriDir,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
