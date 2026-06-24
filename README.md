# TaseDeck

**Desktop app for MCP server management, project presets, and agent `mcp.json` sync.**

TaseDeck helps you install MCP servers from the official registry, configure OAuth and secrets safely, organize servers per project, and export a ready-to-use proxy config for AI coding agents — Cursor, Claude Code, VS Code, Windsurf, and others.

---

## Features

### MCP servers
- Browse and search the [official MCP Registry](https://registry.modelcontextprotocol.io)
- Install local and remote servers with guided configuration (env vars, commands, transports)
- Start/stop servers, inspect tools, toggle tool preferences
- OAuth 2.0 PKCE sign-in for remote MCP endpoints
- Encrypted secret storage (OS Keychain or local master key)

### Projects
- Link a folder on disk to a TaseDeck project
- Attach MCP servers and presets per project agent
- Export `.tasedeck/proxy.mjs` and sync `mcp.json` for the selected agent
- Git tree rail for quick navigation inside the project folder

### Agents (background)
- No separate “Agents” screen — agents are discovered automatically on first launch
- Supported kinds: **Cursor**, **Claude Code**, **VS Code**, **OpenCode**, **Windsurf**, **Codex CLI**, **Antigravity**, **GitHub Copilot**
- Reads and writes each agent’s native `mcp.json` (or equivalent) from known config paths

### Usage & profile
- **Usage** — log of tool calls through the project proxy
- **Profile** — theme (light/dark), OS Keychain toggle, app settings

---

## Screenshots

> Add screenshots before your first public release — e.g. MCP list, project detail, OAuth flow.

---

## Quick start

### Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | 20+ (LTS recommended) |
| [Rust](https://www.rust-lang.org/tools/install) | stable |
| Platform deps | [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) |

**macOS:** Xcode Command Line Tools  
**Windows:** Visual Studio Build Tools, WebView2  
**Linux:** `webkit2gtk` and related packages (see Tauri docs)

### Development

```bash
git clone https://github.com/limboprog/TaseDeck.git
cd TaseDeck
npm install
npm run tauri dev
```

### Production build

```bash
npm run tauri build
```

Installers are written to `src-tauri/target/release/bundle/`.

App icons are generated from `src-tauri/icons/app-icon.svg` automatically via `npm run icons` (also runs in `beforeBuildCommand`).

---

## Download

Pre-built binaries are published via GitHub Actions on pushes to `main` (draft releases).

| Platform | Artifact |
|----------|----------|
| macOS (Apple Silicon) | `.dmg` / `.app` (aarch64) |
| macOS (Intel) | `.dmg` / `.app` (x86_64) |
| Windows | `.msi` / `.exe` |

---

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│  React UI  —  MCP · Projects · Usage · Profile              │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri invoke
┌──────────────────────────▼──────────────────────────────────┐
│  Rust backend  —  SQLite · MCP client · proxy · OAuth       │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   Local database    Project folders     MCP Registry
   (servers,         (.cursor/mcp.json,   (modelcontextprotocol.io)
    presets)          .tasedeck/proxy.mjs)
```

User data is stored under the OS app data directory, e.g. on macOS:

`~/Library/Application Support/TaseDeck/User/Storage/`

For a full pipeline description (registry search, OAuth, encryption, proxy export), see **[TECHNICAL.md](./TECHNICAL.md)**.

---

## Repository layout

| Path | Shipped in the desktop app |
|------|----------------------------|
| `src/` | React + TypeScript UI (Vite, Tamagui) |
| `src-tauri/` | Tauri 2 shell, Rust commands, SQLite, `proxy.mjs` |
| `public/LOGO.svg` | Web favicon |
| `src-tauri/icons/app-icon.svg` | Source for generated app icons |
| `.github/workflows/` | CI: macOS + Windows release builds |

### Not included in this repository

These paths are listed in `.gitignore` — they may exist locally for development but are not part of the open-source desktop app:

| Path | Purpose |
|------|---------|
| `backend/` | Optional Python FastAPI catalog mirror |
| `web/` | Separate marketing site (Next.js) |
| `test_mcp/` | Local stdio MCP test server |
| `test/` | Market probe CLI artifacts |
| `.tasedeck/` | Dev proxy mirror in repo root |
| `note.md`, `plan.md` | Personal notes |
| `mcp copy*.json` | Local MCP config drafts |

---

## Tech stack

| Layer | Technologies |
|-------|----------------|
| UI | React 19, TypeScript, Vite 7, Tamagui 2 |
| Desktop | Tauri 2, Rust, rusqlite |
| MCP | Official registry API, stdio/HTTP transports, Node `proxy.mjs` sidecar |
| Security | AES-256-GCM, OS Keychain (macOS/Windows), deep link `tasedeck://` |

---

## Contributing

1. Fork the repo and create a branch from `main`
2. `npm install && npm run tauri dev` — verify the app runs
3. Keep changes focused; match existing code style
4. Open a pull request with a short description of what and why

Bug reports and feature requests are welcome via GitHub Issues.

---

## License

[MIT](./LICENSE) © Leonid Borodin
