#!/usr/bin/env node
/**
 * TaseDeck topology MCP aggregator (stdio JSON-RPC).
 * Proxies meta-tools to the Tauri bridge over TCP.
 *
 * Env:
 *   TASEDECK_BRIDGE_HOST (default 127.0.0.1)
 *   TASEDECK_BRIDGE_PORT (required)
 *   TASEDECK_TOPOLOGY_ID   (optional, for logs)
 */

import net from "node:net";
import readline from "node:readline";
import { stdin, stdout, stderr } from "node:process";

const SERVER_NAME = "tasedeck-topology";
const SERVER_VERSION = "0.1.0";
const PROTOCOL_VERSION = "2024-11-05";

const BRIDGE_HOST = process.env.TASEDECK_BRIDGE_HOST ?? "127.0.0.1";
const BRIDGE_PORT = Number(process.env.TASEDECK_BRIDGE_PORT ?? "0");
const TOPOLOGY_ID = process.env.TASEDECK_TOPOLOGY_ID ?? "";

/** @type {Map<string, { description: string, inputSchema: object }>} */
const TOOLS = new Map([
  [
    "list_servers",
    {
      description: "List MCP servers that are active in the current topology.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  [
    "tools",
    {
      description: "List tools for a specific MCP server in this topology.",
      inputSchema: {
        type: "object",
        properties: {
          server_id: {
            type: "number",
            description: "MCP server id from list_servers",
          },
        },
        required: ["server_id"],
      },
    },
  ],
  [
    "call_tool",
    {
      description: "Invoke a tool on a specific MCP server in this topology.",
      inputSchema: {
        type: "object",
        properties: {
          server_id: { type: "number" },
          name: { type: "string", description: "Tool name on the target server" },
          arguments: { type: "object", description: "Tool arguments object" },
        },
        required: ["server_id", "name"],
      },
    },
  ],
]);

let initialized = false;
let bridgeRequestId = 0;

function log(level, message, extra) {
  const ts = new Date().toISOString();
  const suffix = extra !== undefined ? ` ${JSON.stringify(extra)}` : "";
  stderr.write(`[${SERVER_NAME}] ${ts} ${level} ${message}${suffix}\n`);
}

function send(message) {
  stdout.write(`${JSON.stringify(message)}\n`);
}

function toolList() {
  return {
    tools: [...TOOLS.entries()].map(([name, meta]) => ({
      name,
      description: meta.description,
      inputSchema: meta.inputSchema,
    })),
  };
}

function bridgeCall(op, payload = {}) {
  if (!BRIDGE_PORT) {
    return Promise.reject(new Error("TASEDECK_BRIDGE_PORT is not set"));
  }

  bridgeRequestId += 1;
  const requestId = bridgeRequestId;
  const body = JSON.stringify({ id: requestId, op, ...payload });

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: BRIDGE_HOST, port: BRIDGE_PORT });
    let buffer = "";

    socket.setEncoding("utf8");
    socket.on("error", reject);

    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        return;
      }
      const line = buffer.slice(0, newline).trim();
      socket.end();
      try {
        const response = JSON.parse(line);
        if (!response.ok) {
          reject(new Error(response.error ?? "bridge request failed"));
          return;
        }
        resolve(response.result);
      } catch (error) {
        reject(error);
      }
    });

    socket.on("end", () => {
      if (buffer.trim()) {
        return;
      }
      reject(new Error("bridge closed without response"));
    });

    socket.write(`${body}\n`);
  });
}

async function handleToolsCall(name, args) {
  log("INFO", "tools/call", { name, arguments: args, topologyId: TOPOLOGY_ID });

  switch (name) {
    case "list_servers": {
      const result = await bridgeCall("list_servers");
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    case "tools": {
      const serverId = Number(args?.server_id);
      if (!Number.isFinite(serverId)) {
        throw new Error("server_id must be a number");
      }
      const result = await bridgeCall("tools", { serverId });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    case "call_tool": {
      const serverId = Number(args?.server_id);
      const toolName = String(args?.name ?? "");
      const toolArgs = args?.arguments ?? {};
      if (!Number.isFinite(serverId) || !toolName) {
        throw new Error("server_id and name are required");
      }
      const result = await bridgeCall("call_tool", {
        serverId,
        name: toolName,
        arguments: toolArgs,
      });
      const text =
        result?.result?.content?.[0]?.text ??
        JSON.stringify(result?.result ?? result, null, 2);
      return {
        content: [{ type: "text", text }],
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function handleRequest(msg) {
  const { id, method, params } = msg;
  log("INFO", "request", { id, method });

  if (method === "initialize") {
    initialized = true;
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (!initialized && method !== "ping") {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32002, message: "Server not initialized" },
    });
    return;
  }

  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: toolList() });
    return;
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const toolArgs = params?.arguments ?? {};
    handleToolsCall(toolName, toolArgs)
      .then((result) => send({ jsonrpc: "2.0", id, result }))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        log("ERROR", "tools/call failed", { toolName, message });
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message },
        });
      });
    return;
  }

  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}

function handleMessage(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    log("ERROR", "invalid JSON", { line: trimmed.slice(0, 200) });
    return;
  }

  if (msg.method) {
    handleRequest(msg);
  }
}

const rl = readline.createInterface({ input: stdin, terminal: false });
rl.on("line", handleMessage);
rl.on("close", () => {
  log("INFO", "stdin closed, exiting");
  process.exit(0);
});

log("INFO", "aggregator started", {
  topologyId: TOPOLOGY_ID,
  bridgeHost: BRIDGE_HOST,
  bridgePort: BRIDGE_PORT,
  tools: [...TOOLS.keys()],
});
