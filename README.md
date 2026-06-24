<p align="right">
  <strong>English</strong> | <a href="./README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="./public/LOGO.svg" alt="TaseDeck logo" width="76" />
</p>

<h1 align="center">TaseDeck - Topology of agent-server execution</h1>

<p align="center">
  A desktop control plane for MCP servers, project presets, agent configs, and tool-call observability.
</p>

<p align="center">
  <a href="#what-is-tasedeck">Overview</a> ·
  <a href="#ui">UI</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#tech-stack">Tech stack</a> ·
  <a href="#development">Development</a>
</p>

---

## What Is TaseDeck

TaseDeck is a desktop application for managing the execution topology between AI agents and MCP servers.

Instead of manually editing multiple `mcp.json` files, duplicating server definitions between projects, or losing track of which agent calls which tool, TaseDeck gives you one local UI for:

- discovering and installing MCP servers from the official registry;
- configuring local, remote, stdio, HTTP and OAuth-backed servers;
- connecting MCP servers to specific projects and specific agents;
- keeping each agent's default configuration safe;
- exporting project-local proxy entries into the correct agent config format;
- observing real tool calls in the Usage view.

The main idea is simple: **agents stay native, MCP servers stay configurable, and TaseDeck owns the topology between them.**

---

## UI

### Project Topology

The Projects screen shows how a project is wired: project -> agent -> preset -> MCP servers. Each agent can have its own server set, its own custom preset, and its own exported project config.

![Project topology](./docs/assets/project-topology.png)

This view is designed around execution topology, not just lists. You can see which agents are attached to the project, what preset each agent is using, which MCP servers are active, and where servers can be added or removed.

### Usage Log

The Usage screen records MCP tool calls routed through the project proxy. It helps answer: which agent called which server, which tool was invoked, whether it succeeded, and what result came back.

<p align="center">
  <a href="./docs/assets/usage-log.png">
    <img src="./docs/assets/usage-log.png" alt="Usage log" width="100%" />
  </a>
</p>

The filters let you inspect calls by caller, MCP server, date, and result. This is useful for debugging agent behavior, validating project presets, and understanding which tools are actually used in a workflow.

### Server Runtime

Every MCP server has an editable runtime profile: command, arguments, environment variables, headers, active transport, tool list, and test results.

![Server runtime](./docs/assets/server-runtime.png)

For local servers, TaseDeck stores the compiled command and can test initialization and tool listing from the UI. For remote servers, it supports HTTP transport and OAuth flows. Tool toggles let you expose only the tools you want.

### MCP Registry

The MCP screen combines installed servers and registry discovery. You can browse installed servers, search registry entries, install new servers, inspect their runtime configuration, and refresh tool metadata.

![MCP registry](./docs/assets/mcp-registry.png)

The installed list is intentionally compact; details live in the right panel. This keeps server discovery, installation, testing, and editing in a single workflow.

---

## Core Mechanics

### Agent discovery and config parsing

On first launch, TaseDeck scans known config locations for supported agents:

- Cursor
- Claude Code
- VS Code
- OpenCode
- Windsurf
- Codex CLI
- Antigravity
- GitHub Copilot

Each provider knows its native config directory and config file shape. TaseDeck reads the existing config, strips its own managed entries, and keeps the user's original MCP servers as the agent's default source.

This means the app can start from what already exists on disk. If an agent already has `mcp.json`, TaseDeck parses it and turns it into structured project/default data instead of forcing the user to recreate everything manually.

### Default config preservation

TaseDeck keeps a default snapshot of native MCP configuration. That default is treated as the baseline for the project/agent relationship.

The default config is important because it gives the user a safe way to experiment:

- import existing MCP servers from a project or agent config;
- create a custom preset for a specific agent;
- add, remove, or override servers inside TaseDeck;
- export the managed proxy entries;
- reset the agent back to the default source when needed.

TaseDeck-managed entries are identifiable and can be removed without destroying the user's own native config.

### Reset agent

Each project agent can be reset. Reset means:

- restore the agent/project `mcp.json` from the saved default source;
- remove the custom preset and custom cache for that agent;
- unlink the agent from the project assignment;
- remove TaseDeck-managed proxy entries while preserving the original config.

This is useful when a project setup becomes noisy, when the user wants to rebuild the topology, or when they want to return to the original agent state.

### Per-agent customization

Different agents can use different MCP servers in the same project.

For example:

- Cursor can use `AppDeploy` and `Linear`;
- Claude Code can use `context7`;
- another agent can use a minimal read-only preset;
- each agent can have different env values, arguments, headers, and enabled tools.

This is handled through project-agent assignments, presets, custom preset caches, and config overrides. The UI exposes this as a project tree where every agent branch can have its own preset and server list.

### Presets and overrides

Presets are server collections. A project can have a default imported preset, while each agent can fork it into a custom preset.

Overrides are stored per project-agent assignment and applied on top of preset server definitions. They can affect runtime details such as:

- command arguments;
- environment variables;
- headers;
- selected run command;
- enabled/disabled tools.

The goal is to avoid duplicating whole server definitions when only one project or one agent needs a small difference.

### MCP server installation

Registry installation supports both remote and local servers.

For registry entries, TaseDeck parses package metadata, transport hints, environment variables, command templates, and remote endpoints. Local npm packages are installed through shell commands such as `npm install -g ...`, while the runtime command can be generated as `npx -y ...` or `npm exec ...` depending on the package profile.

The production app enriches the shell environment so GUI launches can still find tools installed through Homebrew, nvm, fnm, Volta, or the Node installer.

### Runtime testing

Installed servers can be tested directly from the UI:

- initialize;
- list tools;
- run tool probes;
- inspect errors;
- refresh stored tool metadata.

The result is saved back into local state so the UI can show connection status, available tools, and tool preferences.

---

## How It Works

```text
┌─────────────────────────────────────────────────────────────┐
│ React UI                                                     │
│ MCP · Projects · Usage · Profile                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri invoke()
┌──────────────────────────▼──────────────────────────────────┐
│ Rust backend                                                 │
│ SQLite · registry · OAuth · config sync · proxy export       │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   SQLite state       Project folders      MCP Registry
   presets, agents,   .cursor/mcp.json,    registry.modelcontextprotocol.io
   servers, usage     .tasedeck/proxy.mjs
```

### Data flow: registry install

```text
MCP Registry entry
  -> registry parser
  -> install plan
  -> local install or remote config
  -> mcp_servers row in SQLite
  -> runtime profile and tool refresh
  -> available in MCP and Projects UI
```

### Data flow: project export

```text
Project + agent + preset
  -> resolve server list
  -> apply per-agent overrides
  -> write .tasedeck/mcp/{server}.json sidecars
  -> copy .tasedeck/proxy.mjs
  -> upsert TaseDeck-managed entries into agent project config
  -> agent starts proxy as its MCP server
```

### Data flow: tool call logging

```text
Agent
  -> project mcp.json entry
  -> .tasedeck/proxy.mjs
  -> downstream MCP server
  -> response back to agent
  -> log spool
  -> Rust log ingestor
  -> SQLite usage_log
  -> Usage UI
```

---

## Config Strategy

TaseDeck does not try to replace agent configuration systems. It works with them.

For project-local MCP configs it writes to the native location for the selected agent kind, for example:

- `.cursor/mcp.json`
- `.vscode/mcp.json`
- agent-specific equivalents
- TOML config for Codex CLI when required

Generated entries point to the TaseDeck project proxy. Sidecar files are stored under:

```text
.tasedeck/
  proxy.mjs
  mcp/
    server-name.json
```

This keeps generated runtime data project-local and makes the exported config portable with the project folder.

TaseDeck removes and rewrites only its managed entries. User-owned MCP entries are preserved.

---

## Storage And Security

Local app data is stored in the OS application data directory. On macOS:

```text
~/Library/Application Support/TaseDeck/User/Storage/
```

TaseDeck uses SQLite for local state:

- installed MCP servers;
- registry-derived config;
- agent records;
- projects;
- presets;
- assignment overrides;
- tool preferences;
- usage logs.

Secrets are encrypted before storage. The app supports OS Keychain where available, with a local master-key fallback.

OAuth remote MCP servers use PKCE and a local callback/deep-link flow. Runtime access tokens are kept separate from static config values.

---

## Tech Stack

| Layer | Technology |
|------|------------|
| Desktop shell | Tauri 2 |
| Backend | Rust |
| Database | SQLite via `rusqlite` |
| UI | React 19, TypeScript, Vite |
| Components | Tamagui |
| MCP runtime | stdio, Streamable HTTP, proxy sidecar |
| Registry | Official MCP Registry API |
| Security | AES-256-GCM, OS Keychain, OAuth 2.0 PKCE |
| CI | GitHub Actions for macOS and Windows bundles |

---

## Repository Layout

| Path | Purpose |
|------|---------|
| `src/` | React UI, services, feature screens |
| `src-tauri/` | Tauri app, Rust commands, SQLite, MCP runtime |
| `src-tauri/resources/proxy.mjs` | Project-local MCP proxy copied during export |
| `src-tauri/icons/app-icon.svg` | Source app icon |
| `public/LOGO.svg` | README/logo/favicon asset |
| `docs/assets/` | README screenshots |
| `.github/workflows/` | Release build workflow |
| `TECHNICAL.md` | Deeper implementation notes |

Ignored local-only folders such as `backend/`, `web/`, `test/`, `test_mcp/`, `.tasedeck/`, notes, and local MCP drafts are not part of the open-source desktop app.

---

## Development

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ recommended |
| Rust | stable |
| Tauri prerequisites | See the official Tauri 2 docs |

### Run locally

```bash
git clone https://github.com/limboprog/TaseDeck.git
cd TaseDeck
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Installers are generated under:

```text
src-tauri/target/release/bundle/
```

Icons are generated from:

```text
src-tauri/icons/app-icon.svg
```

---

## Open Source Status

TaseDeck is prepared as an open-source desktop app. The repository contains the Tauri application, UI, Rust backend, proxy runtime, CI workflow, icon source, and documentation.

Separate experiments, personal notes, local test harnesses, and non-desktop projects are intentionally ignored.

---

## License

[MIT](./LICENSE) © Leonid Borodin
