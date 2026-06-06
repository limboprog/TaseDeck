/**
 * Minimal MCP stdio JSON-RPC client for integration scripts.
 */

import { spawn } from "node:child_process";
import readline from "node:readline";

/**
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string>} [extraEnv]
 */
export function createMcpStdioSession(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    env: { ...process.env, ...extraEnv },
    stdio: ["pipe", "pipe", "inherit"],
  });

  let nextId = 1;
  /** @type {Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>} */
  const pending = new Map();

  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (message.id === undefined || !pending.has(message.id)) {
      return;
    }

    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);

    if (message.error) {
      reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      return;
    }

    resolve(message.result);
  });

  /**
   * @param {string} method
   * @param {Record<string, unknown>} [params]
   */
  function request(method, params = {}) {
    const id = nextId;
    nextId += 1;

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  return {
    child,
    request,
    async initialize(clientName = "cursor-agent-sim") {
      await request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: clientName, version: "0.1.0" },
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        })}\n`,
      );
    },
    listTools() {
      return request("tools/list", {});
    },
    callTool(name, args = {}) {
      return request("tools/call", { name, arguments: args });
    },
    close() {
      rl.close();
      child.stdin.end();
      child.kill();
    },
  };
}

/** @param {unknown} toolResult */
export function toolResultText(toolResult) {
  if (
    toolResult &&
    typeof toolResult === "object" &&
    "content" in toolResult &&
    Array.isArray(toolResult.content) &&
    toolResult.content[0] &&
    typeof toolResult.content[0] === "object" &&
    "text" in toolResult.content[0]
  ) {
    return String(toolResult.content[0].text);
  }
  return JSON.stringify(toolResult);
}

/** @param {unknown} toolResult */
export function parseToolJson(toolResult) {
  const text = toolResultText(toolResult);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
