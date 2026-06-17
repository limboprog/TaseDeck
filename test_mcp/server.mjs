#!/usr/bin/env node
/**
 * TaseDeck test MCP server (stdio / JSON-RPC, newline-delimited).
 *
 * Use for: connect, tools/list, tools/call with arguments, stderr logs.
 * Run: node test_mcp/server.mjs
 */

import readline from "node:readline";
import { stdin, stdout, stderr } from "node:process";

const SERVER_NAME = "tasedeck-test-mcp";
const SERVER_VERSION = "0.1.0";
const PROTOCOL_VERSION = "2024-11-05";

/** @type {Map<string, { description: string, inputSchema: object }>} */
const TOOLS = new Map([
  [
    "echo_message",
    {
      description: "Echoes a message back (tests string args).",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Text to echo" },
        },
        required: ["message"],
      },
    },
  ],
  [
    "add_numbers",
    {
      description: "Adds two numbers (tests numeric args).",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
    },
  ],
  [
    "list_items",
    {
      description: "Joins string items (tests array args).",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
            description: "Items to join",
          },
          separator: { type: "string", default: ", " },
        },
        required: ["items"],
      },
    },
  ],
  [
    "get_status",
    {
      description: "Returns server status (no required args).",
      inputSchema: {
        type: "object",
        properties: {
          verbose: { type: "boolean", default: false },
        },
      },
    },
  ],
  [
    "read_env_sample",
    {
      description: "Reports whether TASEDECK_TEST_ENV is set (tests env from config).",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  [
    "log_message",
    {
      description: "Writes a message to stderr and returns ok (tests agent call_tool + logs).",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Text to print in server logs" },
          level: {
            type: "string",
            enum: ["INFO", "WARN", "ERROR"],
            default: "INFO",
          },
        },
        required: ["message"],
      },
    },
  ],
]);

let initialized = false;
let requestCount = 0;

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

function handleToolsCall(name, args) {
  log("INFO", "tools/call", { name, arguments: args });

  switch (name) {
    case "echo_message": {
      const message = String(args?.message ?? "");
      return {
        content: [{ type: "text", text: `echo: ${message}` }],
      };
    }
    case "add_numbers": {
      const a = Number(args?.a ?? 0);
      const b = Number(args?.b ?? 0);
      return {
        content: [{ type: "text", text: String(a + b) }],
      };
    }
    case "list_items": {
      const items = Array.isArray(args?.items) ? args.items.map(String) : [];
      const separator = String(args?.separator ?? ", ");
      return {
        content: [{ type: "text", text: items.join(separator) }],
      };
    }
    case "get_status": {
      const verbose = Boolean(args?.verbose);
      const payload = {
        server: SERVER_NAME,
        version: SERVER_VERSION,
        initialized,
        requestCount,
        toolCount: TOOLS.size,
        pid: process.pid,
      };
      return {
        content: [
          {
            type: "text",
            text: verbose ? JSON.stringify(payload, null, 2) : JSON.stringify(payload),
          },
        ],
      };
    }
    case "read_env_sample": {
      const value = process.env.TASEDECK_TEST_ENV ?? "";
      return {
        content: [
          {
            type: "text",
            text: value
              ? `TASEDECK_TEST_ENV=${value}`
              : "TASEDECK_TEST_ENV is not set",
          },
        ],
      };
    }
    case "log_message": {
      const message = String(args?.message ?? "");
      const level = String(args?.level ?? "INFO").toUpperCase();
      const safeLevel = ["INFO", "WARN", "ERROR"].includes(level) ? level : "INFO";
      log(safeLevel, message);
      return {
        content: [{ type: "text", text: `logged: ${message}` }],
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRequest(msg) {
  const { id, method, params } = msg;
  requestCount += 1;
  log("INFO", "request", { id, method });

  if (method === "initialize") {
    initialized = true;
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
      },
    });
    return;
  }

  if (method === "notifications/initialized") {
    log("INFO", "client initialized");
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

  try {
    if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: toolList() });
      return;
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};
      const result = handleToolsCall(toolName, toolArgs);
      send({ jsonrpc: "2.0", id, result });
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", "handler failed", { method, message });
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message },
    });
  }
}

function handleMessage(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (error) {
    log("ERROR", "invalid JSON", { line: trimmed.slice(0, 200) });
    return;
  }

  if (msg.method) {
    handleRequest(msg);
    return;
  }

  if (msg.id !== undefined) {
    log("DEBUG", "ignored response-shaped message", { id: msg.id });
  }
}

const rl = readline.createInterface({ input: stdin, terminal: false });

rl.on("line", handleMessage);
rl.on("close", () => {
  log("INFO", "stdin closed, exiting");
  process.exit(0);
});

log("INFO", "server started", {
  version: SERVER_VERSION,
  tools: [...TOOLS.keys()],
  node: process.version,
});
