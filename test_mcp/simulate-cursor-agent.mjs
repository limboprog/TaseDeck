#!/usr/bin/env node
/**
 * Simulates a Cursor-like agent via proxy.mjs + sidecar config.
 *
 * Usage:
 *   node simulate-cursor-agent.mjs
 *   TEST_MCP_SERVER_NAME=test node simulate-cursor-agent.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMcpStdioSession,
  toolResultText,
} from "./mcp_stdio_client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const serverNameHint = process.env.TEST_MCP_SERVER_NAME?.trim() || "test";
const proxyPath =
  process.env.TASEDECK_PROXY_PATH?.trim() ||
  path.resolve(__dirname, "../src-tauri/resources/proxy.mjs");
const downstreamScript =
  process.env.TEST_MCP_DOWNSTREAM?.trim() ||
  path.resolve(__dirname, "server.mjs");

const APP_DIR_NAME = "TaseDeck";

function platformDataDir() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support");
  }
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(home, "AppData", "Roaming");
  }
  return process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
}

function userStorageDir() {
  return path.join(platformDataDir(), APP_DIR_NAME, "User", "Storage");
}

function sanitizeFilename(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "mcp-server";
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function proxySpoolPath(projectId, serverName) {
  const safe = sanitizeFilename(serverName);
  return path.join(userStorageDir(), "proxy-spool", String(projectId), `${safe}.jsonl`);
}

function step(title) {
  console.log(`\n=== ${title} ===`);
}

function fail(message) {
  console.error(`\nFAIL: ${message}`);
  process.exit(1);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tasedeck-proxy-sim-"));
const sidecarPath = path.join(tmpRoot, ".tasedeck", "mcp", `${serverNameHint}.json`);

fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
fs.writeFileSync(
  sidecarPath,
  JSON.stringify(
    {
      serverId: 1,
      serverName: serverNameHint,
      projectId: 0,
      command: "node",
      args: [downstreamScript],
      env: {},
      toolEnabled: {},
      caller: "cursor-sim",
      idleShutdownMs: 300_000,
    },
    null,
    2,
  ),
);

console.log("Cursor agent simulation → proxy + sidecar");
console.log({ proxyPath, sidecarPath, downstreamScript });

const session = createMcpStdioSession("node", [proxyPath, "--config", sidecarPath], {
  TASEDECK_SERVER_CONFIG: sidecarPath,
});

try {
  step("1. initialize");
  await session.initialize("cursor");

  step("2. tools/list (native tools, filtered by sidecar)");
  const toolsPayload = await session.listTools();
  const remoteTools = toolsPayload.tools ?? [];
  console.log(remoteTools.map((tool) => tool.name).join(", "));
  if (remoteTools.length === 0) {
    fail("proxy returned no tools");
  }

  const toolToCall = remoteTools.some((tool) => tool.name === "log_message")
    ? "log_message"
    : remoteTools.some((tool) => tool.name === "echo_message")
      ? "echo_message"
      : remoteTools[0].name;
  const toolArgs =
    toolToCall === "log_message"
      ? { message: "Hello from Cursor agent simulation", level: "INFO" }
      : toolToCall === "echo_message"
        ? { message: "Hello from Cursor agent simulation" }
        : {};

  step(`3. tools/call → ${toolToCall}`);
  const callPayload = await session.callTool(toolToCall, toolArgs);
  console.log(toolResultText(callPayload));

  if (fs.existsSync(proxySpoolPath(0, serverNameHint))) {
    console.log("\nUsage log line:");
    console.log(
      fs.readFileSync(proxySpoolPath(0, serverNameHint), "utf8").trim(),
    );
  }

  console.log("\nOK — proxy flow completed");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
} finally {
  session.close();
}
