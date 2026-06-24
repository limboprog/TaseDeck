#!/usr/bin/env node
/**
 * TaseDeck per-server MCP proxy (stdio JSON-RPC).
 * Reads `.tasedeck/mcp/<server>.json`, spawns downstream, filters tools, logs to jsonl.
 *
 *   node proxy.mjs --config /path/to/.tasedeck/mcp/context7.json
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { stdin, stdout, stderr } from "node:process";

const PROTOCOL_VERSION = "2024-11-05";
const PROXY_VERSION = "0.2.0";
const MAX_LOG_RESULT_CHARS = 8192;
const APP_DIR_NAME = "TaseDeck";
const RECONNECT_MAX_ATTEMPTS = 6;
const RECONNECT_BASE_DELAY_MS = 750;
const RECONNECT_MAX_DELAY_MS = 10_000;
const OAUTH_REFRESH_WAIT_MS = 12_000;
const DOWNSTREAM_REQUEST_TIMEOUT_MS = 60_000;
const TOOLS_REFRESH_MIN_INTERVAL_MS = 5_000;

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

function oauthRuntimeTokenPath(serverId) {
  const id = Number(serverId ?? 0);
  if (!Number.isFinite(id) || id <= 0) {
    return "";
  }
  return path.join(userStorageDir(), "oauth-runtime", `${id}.token`);
}

function oauthRefreshRequestPath(serverId) {
  const id = Number(serverId ?? 0);
  if (!Number.isFinite(id) || id <= 0) {
    return "";
  }
  return path.join(userStorageDir(), "oauth-runtime", `${id}.refresh`);
}

function proxySpoolPath(projectId, serverName) {
  const project = Number(projectId ?? 0);
  const safe = sanitizeFilename(serverName);
  return path.join(userStorageDir(), "proxy-spool", String(project), `${safe}.jsonl`);
}

function parseArgs(argv) {
  const result = { configPath: process.env.TASEDECK_SERVER_CONFIG?.trim() ?? "" };
  const args = [...argv];
  while (args.length > 0) {
    const token = args.shift();
    if (token === "--config") {
      result.configPath = String(args.shift() ?? "");
    }
  }
  return result;
}

function resolveConfigPath(configPath) {
  const raw = configPath.trim();
  if (!raw) {
    throw new Error("TASEDECK_SERVER_CONFIG or --config is required");
  }

  const basename = path.basename(raw);
  const seen = new Set();
  const candidates = [];

  const push = (candidate) => {
    const normalized = path.normalize(candidate);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      candidates.push(normalized);
    }
  };

  if (path.isAbsolute(raw)) {
    push(raw);
  } else {
    push(path.resolve(process.cwd(), raw));
    push(path.join(process.cwd(), ".tasedeck", "mcp", basename));

    // Legacy export used `../.tasedeck/...` assuming cwd was `.cursor/`.
    push(path.join(process.cwd(), "..", ".tasedeck", "mcp", basename));

    let dir = process.cwd();
    for (let depth = 0; depth < 8; depth += 1) {
      push(path.join(dir, ".tasedeck", "mcp", basename));
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `sidecar config not found: ${raw} (cwd=${process.cwd()}, tried ${candidates.length} paths)`,
  );
}

function loadConfig(configPath) {
  const resolved = resolveConfigPath(configPath);
  const raw = fs.readFileSync(resolved, "utf8");
  return { config: JSON.parse(raw), resolvedPath: resolved };
}

const cli = parseArgs(process.argv.slice(2));
const { config, resolvedPath: resolvedConfigPath } = loadConfig(cli.configPath);
const SERVER_LABEL = config.serverName || `mcp-${config.serverId ?? 0}`;

function toolsCacheFilePath() {
  if (resolvedConfigPath.endsWith(".json")) {
    return `${resolvedConfigPath.slice(0, -5)}.tools.json`;
  }
  return `${resolvedConfigPath}.tools.json`;
}

function loadToolsCache() {
  try {
    const raw = fs.readFileSync(toolsCacheFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.tools) && parsed.tools.length > 0) {
      cachedTools = parsed.tools;
      log("INFO", "loaded tools cache", { count: cachedTools.length });
      return true;
    }
  } catch {
    /* cache miss */
  }
  return false;
}

function saveToolsCache() {
  if (cachedTools.length === 0) {
    return;
  }
  try {
    const target = toolsCacheFilePath();
    const payload = `${JSON.stringify({ tools: cachedTools, cachedAt: new Date().toISOString() }, null, 2)}\n`;
    atomicWriteFileSync(target, payload);
  } catch (error) {
    log("WARN", "failed to save tools cache", { message: errorMessage(error) });
  }
}

function atomicWriteFileSync(targetPath, contents) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, contents, "utf8");
  try {
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(tempPath, targetPath);
  }
}

function notifyToolsListChanged() {
  if (!initialized || shuttingDown) {
    return;
  }
  send({ jsonrpc: "2.0", method: "notifications/tools/list_changed", params: {} });
}

let initialized = false;
/** @type {"stdio" | "remote"} */
let downstreamMode = "stdio";
/** @type {import("node:child_process").ChildProcess | null} */
let downstream = null;
/** @type {{ transport: string, url: string, headers: Record<string, string>, sessionId: string | null, nextId: number } | null} */
let remoteDownstream = null;
/** @type {Map<number, { resolve: Function, reject: Function }>} */
const downstreamPending = new Map();
let downstreamNextId = 1;
/** @type {readline.Interface | null} */
let downstreamReader = null;
let downstreamConnected = false;
let downstreamReadyPromise = null;
/** @type {Array<{ name: string, description?: string, inputSchema?: object }>} */
let cachedTools = [];
let lastActivityAt = Date.now();
let idleTimer = null;
let shuttingDown = false;
let lastToolsRefreshAt = 0;
/** @type {Promise<unknown> | null} */
let toolsRefreshInFlight = null;

const usageLogQueue = [];
let usageLogFlushScheduled = false;

function log(level, message, extra) {
  const ts = new Date().toISOString();
  const suffix = extra !== undefined ? ` ${JSON.stringify(extra)}` : "";
  stderr.write(`[proxy:${SERVER_LABEL}] ${ts} ${level} ${message}${suffix}\n`);
}

function touchActivity() {
  lastActivityAt = Date.now();
}

function send(message) {
  stdout.write(`${JSON.stringify(message)}\n`);
}

function isToolExplicitlyDisabled(toolName) {
  const map = config.toolEnabled ?? {};
  return map[toolName] === false;
}

function isToolEnabled(toolName) {
  return !isToolExplicitlyDisabled(toolName);
}

function isToolListed(toolName) {
  const map = config.toolEnabled ?? {};
  const keys = Object.keys(map);
  if (keys.length === 0) {
    return true;
  }
  // Deny-list: only explicit `false` disables. Legacy sidecars with lone `true` entries
  // must not be treated as a whitelist.
  const hasDisabled = keys.some((name) => map[name] === false);
  if (!hasDisabled) {
    return true;
  }
  return isToolEnabled(toolName);
}

function disabledToolHint(toolName) {
  return `Tool "${toolName}" is disabled in TaseDeck. Enable it in the project MCP settings and reload MCP in Cursor.`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isAuthError(error) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden")
  );
}

function isRetryableError(error) {
  const message = errorMessage(error).toLowerCase();
  const retryableCodes = [
    "econnrefused",
    "enotfound",
    "enetunreach",
    "etimedout",
    "econnreset",
    "ehostunreach",
    "epipe",
    "fetch failed",
    "network",
    "socket hang up",
    "aborted",
  ];
  if (retryableCodes.some((code) => message.includes(code))) {
    return true;
  }
  if (
    message.includes("downstream process exited") ||
    message.includes("downstream is not running") ||
    message.includes("remote downstream is not running")
  ) {
    return true;
  }
  if (message.includes("http 502") || message.includes("http 503") || message.includes("http 504")) {
    return true;
  }
  return isAuthError(error);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readOAuthToken() {
  const tokenPath = oauthRuntimeTokenPath(config.serverId);
  if (!tokenPath) {
    return "";
  }
  try {
    return fs.readFileSync(tokenPath, "utf8").trim();
  } catch {
    return "";
  }
}

function requestOAuthTokenRefresh() {
  const refreshPath = oauthRefreshRequestPath(config.serverId);
  if (!refreshPath) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(refreshPath), { recursive: true });
    fs.writeFileSync(refreshPath, `${Date.now()}\n`, "utf8");
    log("INFO", "requested oauth token refresh", { serverId: config.serverId });
  } catch (error) {
    log("WARN", "failed to request oauth refresh", { message: errorMessage(error) });
  }
}

async function waitForOAuthTokenUpdate(previousToken) {
  const tokenPath = oauthRuntimeTokenPath(config.serverId);
  if (!tokenPath) {
    return false;
  }

  const deadline = Date.now() + OAUTH_REFRESH_WAIT_MS;
  let previousMtime = 0;
  try {
    previousMtime = fs.statSync(tokenPath).mtimeMs;
  } catch {
    /* token may not exist yet */
  }

  while (Date.now() < deadline) {
    await delay(400);
    try {
      const stat = fs.statSync(tokenPath);
      const token = fs.readFileSync(tokenPath, "utf8").trim();
      if (token && (token !== previousToken || stat.mtimeMs > previousMtime)) {
        log("INFO", "oauth token updated");
        return true;
      }
    } catch {
      /* keep waiting */
    }
  }

  return false;
}

function resetDownstream(reason) {
  log("INFO", "resetting downstream", { reason });
  if (downstreamReader) {
    downstreamReader.close();
    downstreamReader = null;
  }
  if (downstream && downstream.exitCode === null && !downstream.killed) {
    try {
      downstream.stdin?.end();
    } catch {
      /* ignore */
    }
    try {
      downstream.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  downstream = null;
  downstreamConnected = false;
  downstreamReadyPromise = null;
  downstreamPending.clear();
  remoteDownstream = null;
  cachedTools = [];
}

async function runWithReconnect(label, fn) {
  let lastError;
  let previousToken = readOAuthToken();

  for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt += 1) {
    try {
      await ensureDownstream();
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      log("WARN", `${label} failed`, {
        attempt,
        retryable,
        message: errorMessage(error),
      });

      if (!retryable || attempt === RECONNECT_MAX_ATTEMPTS) {
        throw error;
      }

      resetDownstream(errorMessage(error));

      if (isAuthError(error) && isRemoteConfig()) {
        requestOAuthTokenRefresh();
        await waitForOAuthTokenUpdate(previousToken);
        previousToken = readOAuthToken();
      }

      const backoff = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
        RECONNECT_MAX_DELAY_MS,
      );
      await delay(backoff);
    }
  }

  throw lastError ?? new Error(`${label} failed`);
}

function appendUsageLog(entry) {
  usageLogQueue.push(entry);
  if (usageLogFlushScheduled) {
    return;
  }
  usageLogFlushScheduled = true;
  setImmediate(flushUsageLogQueue);
}

function flushUsageLogQueue() {
  usageLogFlushScheduled = false;
  while (usageLogQueue.length > 0) {
    const entry = usageLogQueue.shift();
    const logFile = proxySpoolPath(config.projectId, config.serverName || SERVER_LABEL);
    if (!logFile) {
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("WARN", "failed to append usage log", { message });
    }
  }
}

function recordToolCall(toolName, success, resultText) {
  const text = String(resultText ?? "");
  const result =
    text.length > MAX_LOG_RESULT_CHARS
      ? `${text.slice(0, MAX_LOG_RESULT_CHARS)}\n…[truncated]`
      : text;
  appendUsageLog({
    projectId: Number(config.projectId ?? 0),
    mcpName: SERVER_LABEL,
    toolName,
    caller: config.caller || "agent",
    success,
    result,
    createdAt: new Date().toISOString(),
  });
}

function scheduleIdleShutdown() {
  const idleMs = Number(config.idleShutdownMs ?? 300_000);
  if (!Number.isFinite(idleMs) || idleMs <= 0) {
    return;
  }
  if (idleTimer) {
    clearInterval(idleTimer);
  }
  idleTimer = setInterval(() => {
    if (shuttingDown) {
      return;
    }
    if (Date.now() - lastActivityAt >= idleMs) {
      log("INFO", "idle timeout, shutting down downstream");
      shutdown(0);
    }
  }, Math.min(idleMs, 30_000));
}

function isRemoteConfig() {
  const transport = String(config.transport ?? "").trim().toLowerCase();
  const url = String(config.url ?? "").trim();
  return url.length > 0 && (transport === "streamable-http" || transport === "sse" || transport === "http");
}

function resolveAuthorizationHeader() {
  const tokenFile = oauthRuntimeTokenPath(config.serverId);
  if (tokenFile) {
    try {
      const token = fs.readFileSync(tokenFile, "utf8").trim();
      if (token) {
        return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
        const message = error instanceof Error ? error.message : String(error);
        log("WARN", "failed to read oauth token", { serverId: config.serverId, message });
      }
    }
  }

  for (const [key, value] of Object.entries(config.headers ?? {})) {
    if (key.toLowerCase() === "authorization" && value) {
      return String(value).startsWith("Bearer ") ? String(value) : `Bearer ${value}`;
    }
  }

  return null;
}

async function remoteJsonRpcRequest(method, params = {}) {
  if (!remoteDownstream) {
    throw new Error("remote downstream is not running");
  }
  const id = remoteDownstream.nextId;
  remoteDownstream.nextId += 1;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...remoteDownstream.headers,
  };
  const authorization = resolveAuthorizationHeader();
  if (authorization) {
    headers.Authorization = authorization;
  }
  if (remoteDownstream.sessionId) {
    headers["Mcp-Session-Id"] = remoteDownstream.sessionId;
  }

  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNSTREAM_REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(remoteDownstream.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`remote MCP request timed out after ${DOWNSTREAM_REQUEST_TIMEOUT_MS}ms`);
    }
    throw new Error(`remote MCP request failed: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  const sessionId = response.headers.get("mcp-session-id");
  if (sessionId) {
    remoteDownstream.sessionId = sessionId;
  }

  const contentType = response.headers.get("content-type") ?? "";
  let payload;
  if (contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    const text = await response.text();
    const line = text
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("data:"));
    if (!line) {
      throw new Error(`remote MCP returned unexpected payload: ${text.slice(0, 200)}`);
    }
    payload = JSON.parse(line.slice(5).trim());
  }

  if (!response.ok) {
    const status = response.status;
    const detail =
      payload?.error?.message ??
      `remote MCP HTTP ${status}: ${JSON.stringify(payload).slice(0, 200)}`;
    if (status === 401 || status === 403) {
      throw new Error(`remote MCP HTTP ${status}: unauthorized`);
    }
    throw new Error(detail);
  }
  if (payload.error) {
    throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  }
  return payload.result;
}

async function ensureDownstream() {
  if (downstreamConnected) {
    if (isRemoteConfig()) {
      if (remoteDownstream) {
        return;
      }
    } else if (downstream && downstream.exitCode === null && !downstream.killed) {
      return;
    }
    resetDownstream("stale connection");
  }

  if (isRemoteConfig()) {
    await connectRemoteDownstream();
    return;
  }
  await connectStdioDownstream();
}

async function connectRemoteDownstream() {
  const url = String(config.url ?? "").trim();
  if (!url) {
    throw new Error("sidecar config is missing remote url");
  }

  downstreamMode = "remote";
  remoteDownstream = {
    transport: String(config.transport ?? "streamable-http").trim(),
    url,
    headers: config.headers ?? {},
    sessionId: null,
    nextId: 1,
  };

  try {
    await remoteJsonRpcRequest("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "tasedeck-proxy", version: PROXY_VERSION },
    });
    try {
      await remoteJsonRpcRequest("notifications/initialized", {});
    } catch {
      /* optional for HTTP transport */
    }
    downstreamConnected = true;
  } catch (error) {
    resetDownstream("remote init failed");
    throw error;
  }
}

async function connectStdioDownstream() {
  if (downstreamReadyPromise) {
    return downstreamReadyPromise;
  }

  const command = config.command?.trim();
  if (!command) {
    throw new Error("sidecar config is missing command");
  }

  downstreamMode = "stdio";

  const args = Array.isArray(config.args) ? config.args.map(String) : [];
  const env = { ...process.env, ...(config.env ?? {}) };

  downstream = spawn(command, args, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  downstreamPending.clear();

  downstreamReadyPromise = new Promise((resolve, reject) => {
    const fail = (error) => {
      const wrapped = error instanceof Error ? error : new Error(String(error));
      resetDownstream(wrapped.message);
      reject(wrapped);
    };

    downstream.on("error", fail);
    downstream.on("exit", (code, signal) => {
      if (!shuttingDown) {
        log("WARN", "downstream exited unexpectedly", { code, signal });
      }
      downstreamConnected = false;
      downstream = null;
      downstreamReadyPromise = null;
      for (const { reject: pendingReject } of downstreamPending.values()) {
        pendingReject(new Error("downstream process exited"));
      }
      downstreamPending.clear();
    });

    downstreamReader = readline.createInterface({ input: downstream.stdout });
    downstreamReader.on("line", (line) => {
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
      if (message.id === undefined || !downstreamPending.has(message.id)) {
        return;
      }
      const { resolve: pendingResolve, reject: pendingReject } = downstreamPending.get(message.id);
      downstreamPending.delete(message.id);
      if (message.error) {
        pendingReject(new Error(message.error.message ?? JSON.stringify(message.error)));
        return;
      }
      pendingResolve(message.result);
    });

    downstreamRequest("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "tasedeck-proxy", version: PROXY_VERSION },
    })
      .then(() => {
        downstream.stdin.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
            params: {},
          })}\n`,
        );
        downstreamConnected = true;
        resolve();
      })
      .catch(fail);
  });

  return downstreamReadyPromise;
}

function downstreamRequest(method, params = {}) {
  if (downstreamMode === "remote") {
    return remoteJsonRpcRequest(method, params);
  }
  if (!downstream?.stdin) {
    return Promise.reject(new Error("downstream is not running"));
  }
  const id = downstreamNextId;
  downstreamNextId += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      downstreamPending.delete(id);
      reject(new Error(`downstream request timed out after ${DOWNSTREAM_REQUEST_TIMEOUT_MS}ms`));
    }, DOWNSTREAM_REQUEST_TIMEOUT_MS);
    downstreamPending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    downstream.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

async function refreshToolsFromDownstream() {
  const now = Date.now();
  if (now - lastToolsRefreshAt < TOOLS_REFRESH_MIN_INTERVAL_MS) {
    return cachedTools;
  }
  if (toolsRefreshInFlight) {
    return toolsRefreshInFlight;
  }

  toolsRefreshInFlight = (async () => {
    const tools = await runWithReconnect("tools/list", async () => {
      await ensureDownstream();
      const result = await downstreamRequest("tools/list", {});
      const listed = Array.isArray(result?.tools) ? result.tools : [];
      return listed.filter((tool) => tool?.name);
    });
    cachedTools = tools;
    saveToolsCache();
    lastToolsRefreshAt = Date.now();
    return cachedTools;
  })().finally(() => {
    toolsRefreshInFlight = null;
  });

  return toolsRefreshInFlight;
}

function normalizeToolForList(tool) {
  const schema = tool.inputSchema ?? tool.input_schema ?? { type: "object", properties: {} };
  return {
    name: tool.name,
    description: String(tool.description ?? ""),
    inputSchema: schema,
  };
}

function listCachedToolsForAgent() {
  loadToolsCache();
  return toolListPayload();
}

function toolListPayload() {
  return {
    tools: cachedTools
      .filter((tool) => isToolListed(tool.name))
      .map((tool) => {
        const normalized = normalizeToolForList(tool);
        const enabled = isToolEnabled(tool.name);
        if (!enabled) {
          const hint = " (disabled in TaseDeck — enable in project MCP settings)";
          normalized.description = normalized.description
            ? `${normalized.description}${hint}`
            : hint.trim();
        }
        return normalized;
      }),
  };
}

async function handleToolsCall(name, args) {
  touchActivity();
  if (!isToolEnabled(name)) {
    throw new Error(disabledToolHint(name));
  }

  log("INFO", "tools/call", { name, arguments: args });

  try {
    const result = await runWithReconnect(`tools/call:${name}`, async () => {
      await ensureDownstream();
      return downstreamRequest("tools/call", {
        name,
        arguments: args ?? {},
      });
    });
    const text =
      result?.content?.[0]?.text ??
      (typeof result === "string" ? result : JSON.stringify(result ?? {}, null, 2));
    recordToolCall(name, true, String(text));
    void refreshToolsFromDownstream().catch(() => {});
    if (result?.content) {
      return result;
    }
    return { content: [{ type: "text", text: String(text) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordToolCall(name, false, message);
    throw error;
  }
}

function handleRequest(msg) {
  const { id, method, params } = msg;
  touchActivity();
  log("INFO", "request", { id, method });

  if (method === "initialize") {
    initialized = true;
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_LABEL, version: PROXY_VERSION },
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
    const payload = listCachedToolsForAgent();
    log("INFO", "tools/list (cache)", { count: payload.tools.length });
    send({ jsonrpc: "2.0", id, result: payload });
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
        send({ jsonrpc: "2.0", id, error: { code: -32603, message } });
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

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
  if (downstreamReader) {
    downstreamReader.close();
    downstreamReader = null;
  }
  if (downstream && downstream.exitCode === null) {
    try {
      downstream.stdin?.end();
    } catch {
      /* ignore */
    }
    downstream.kill("SIGTERM");
    setTimeout(() => {
      if (downstream && downstream.exitCode === null) {
        downstream.kill("SIGKILL");
      }
    }, 2_000).unref();
  }
  remoteDownstream = null;
  downstreamConnected = false;
  downstreamReadyPromise = null;
  log("INFO", "proxy shutting down");
  process.exit(code);
}

const rl = readline.createInterface({ input: stdin, terminal: false });
rl.on("line", handleMessage);
rl.on("close", () => {
  log("INFO", "stdin closed, exiting");
  shutdown(0);
});

stdin.on("error", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

scheduleIdleShutdown();

log("INFO", "proxy started", {
  serverName: config.serverName,
  serverId: config.serverId,
  projectId: config.projectId,
  configPath: resolvedConfigPath,
  configArg: cli.configPath,
  storageDir: userStorageDir(),
  mode: isRemoteConfig() ? "remote" : "stdio",
  downstream: isRemoteConfig()
    ? [config.transport, config.url]
    : [config.command, ...(config.args ?? [])],
});

loadToolsCache();
