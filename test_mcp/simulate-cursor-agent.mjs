#!/usr/bin/env node
/**
 * Simulates a Cursor-like agent talking to the TaseDeck topology aggregator MCP:
 *   1. initialize + tools/list (aggregator meta-tools)
 *   2. call_tool list_servers
 *   3. call_tool tools(server_id) for test MCP
 *   4. call_tool call_tool(server_id, log_message, …)
 *
 * Prerequisites:
 *   - Topology is playing in TaseDeck (bridge TCP is up)
 *   - test_mcp is installed, linked to an agent, edge enabled + active
 *
 * Usage:
 *   TASEDECK_BRIDGE_PORT=60382 node simulate-cursor-agent.mjs
 *   TASEDECK_BRIDGE_PORT=60382 npm run simulate-agent
 *
 * Optional env:
 *   TASEDECK_BRIDGE_HOST       default 127.0.0.1
 *   TASEDECK_TOPOLOGY_ID       optional label for aggregator logs
 *   TEST_MCP_SERVER_NAME       substring to find server in list_servers (default: test)
 *   TASEDECK_AGGREGATOR_PATH   override path to topology_aggregator.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMcpStdioSession,
  parseToolJson,
  toolResultText,
} from "./mcp_stdio_client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const bridgePort = process.env.TASEDECK_BRIDGE_PORT?.trim();
const bridgeHost = process.env.TASEDECK_BRIDGE_HOST?.trim() || "127.0.0.1";
const topologyId = process.env.TASEDECK_TOPOLOGY_ID?.trim() || "agent-sim";
const serverNameHint = process.env.TEST_MCP_SERVER_NAME?.trim() || "test";
const aggregatorPath =
  process.env.TASEDECK_AGGREGATOR_PATH?.trim() ||
  path.resolve(__dirname, "../src-tauri/resources/topology_aggregator.mjs");

function usage() {
  console.error(`Usage: TASEDECK_BRIDGE_PORT=<port> node simulate-cursor-agent.mjs

Get bridge port from TaseDeck after pressing Play on a topology
(topology status / mcp.json entry TASEDECK_BRIDGE_PORT).

Example:
  TASEDECK_BRIDGE_PORT=60382 node ${path.basename(fileURLToPath(import.meta.url))}
`);
}

function step(title) {
  console.log(`\n=== ${title} ===`);
}

function fail(message) {
  console.error(`\nFAIL: ${message}`);
  process.exit(1);
}

if (!bridgePort || !/^\d+$/.test(bridgePort)) {
  usage();
  process.exit(1);
}

console.log("Cursor agent simulation → topology aggregator");
console.log({
  bridgeHost,
  bridgePort,
  topologyId,
  aggregatorPath,
  serverNameHint,
});

const session = createMcpStdioSession("node", [aggregatorPath], {
  TASEDECK_BRIDGE_HOST: bridgeHost,
  TASEDECK_BRIDGE_PORT: bridgePort,
  TASEDECK_TOPOLOGY_ID: topologyId,
});

try {
  step("0. initialize");
  await session.initialize("cursor");

  step("1. tools/list (aggregator meta-tools)");
  const aggregatorTools = await session.listTools();
  const toolNames = (aggregatorTools.tools ?? []).map((tool) => tool.name);
  console.log(toolNames.join(", "));
  for (const required of ["list_servers", "tools", "call_tool"]) {
    if (!toolNames.includes(required)) {
      fail(`aggregator is missing meta-tool: ${required}`);
    }
  }

  step("2. call_tool list_servers");
  const serversPayload = parseToolJson(await session.callTool("list_servers", {}));
  const servers = serversPayload?.servers;
  if (!Array.isArray(servers) || servers.length === 0) {
    fail(
      "no active MCP servers in topology — link test_mcp to an agent, enable edge, press Play",
    );
  }
  console.log(JSON.stringify(servers, null, 2));

  const testServer = servers.find((entry) =>
    String(entry.name ?? "")
      .toLowerCase()
      .includes(serverNameHint.toLowerCase()),
  );
  if (!testServer?.id) {
    fail(
      `server matching "${serverNameHint}" not found in list_servers. Names: ${servers
        .map((entry) => entry.name)
        .join(", ")}`,
    );
  }
  console.log(`Selected server: id=${testServer.id} name=${testServer.name}`);

  step(`3. call_tool tools(server_id=${testServer.id})`);
  const toolsPayload = parseToolJson(
    await session.callTool("tools", { server_id: testServer.id }),
  );
  const remoteTools = toolsPayload?.tools ?? [];
  console.log(
    `serverName=${toolsPayload?.serverName ?? testServer.name} tools=${remoteTools
      .map((tool) => tool.name)
      .join(", ")}`,
  );
  if (!remoteTools.some((tool) => tool.name === "log_message")) {
    console.warn("WARN: log_message not in remote tools — using echo_message");
  }
  const toolToCall = remoteTools.some((tool) => tool.name === "log_message")
    ? "log_message"
    : "echo_message";
  const toolArgs =
    toolToCall === "log_message"
      ? { message: "Hello from Cursor agent simulation", level: "INFO" }
      : { message: "Hello from Cursor agent simulation" };

  step(`4. call_tool call_tool → ${toolToCall}`);
  const callPayload = await session.callTool("call_tool", {
    server_id: testServer.id,
    name: toolToCall,
    arguments: toolArgs,
  });
  console.log(toolResultText(callPayload));

  console.log("\nOK — agent flow completed (check tauri dev stderr for [tasedeck-test-mcp] logs)");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
} finally {
  session.close();
}
