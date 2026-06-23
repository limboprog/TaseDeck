# TaseDeck

Desktop app for MCP server management, project presets, and agent `mcp.json` sync.

**Run:** `npm install && npm run tauri dev`

**Architecture & pipelines:** see [TECHNICAL.md](./TECHNICAL.md)

## Stack

- **UI:** React 19, TypeScript, Vite, Tamagui
- **Desktop:** Tauri 2, Rust, SQLite
- **MCP:** Official registry, local proxy (`proxy.mjs`), OAuth 2.0 PKCE

## Repo layout

| Path | In app build |
|------|----------------|
| `src/`, `src-tauri/` | Yes |
| `backend/`, `web/`, `test_mcp/`, `test/` | No (gitignored) |

