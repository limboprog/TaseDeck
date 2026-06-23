# TaseDeck — техническое описание

Desktop-приложение для управления MCP-серверами, пресетами и проектами с автоматической синхронизацией `mcp.json` агентов (Cursor, Claude Code, VS Code и др.).

**Состав репозитория (что входит в приложение):**

| Путь | Назначение |
|------|------------|
| `src/` | React UI (Vite + Tamagui) |
| `src-tauri/` | Rust backend (Tauri 2), SQLite, MCP proxy |
| `package.json` | Frontend + `npm run tauri dev` |

**Вынесено в `.gitignore` (не часть desktop-сборки):**

| Путь | Назначение |
|------|------------|
| `backend/` | Опциональный Python FastAPI каталог MCP |
| `web/` | Отдельный Next.js маркетинговый сайт |
| `test_mcp/` | Локальный stdio MCP для ручных тестов |
| `test/` | CLI `run-market-probes.mjs` |
| `.tasedeck/` | Dev-зеркало proxy/sidecar в корне репо |

---

## Стек технологий

### Frontend
- **React 19** + **TypeScript**
- **Vite 7** — сборка, HMR
- **Tamagui 2** — UI-компоненты, темы light/dark
- **Tauri API** (`@tauri-apps/api`) — `invoke()` к Rust-командам
- **Web Worker** — поиск в MCP Registry (`registry.worker.ts`)

### Backend (Tauri / Rust)
- **Tauri 2** — desktop shell, deep links, dialog, opener
- **rusqlite** (bundled) — локальная SQLite
- **reqwest** — HTTP к registry, OAuth, remote MCP
- **aes-gcm** + **keyring** — шифрование секретов
- **tokio** — async (ограниченно; большинство DB через `spawn_blocking`)
- **serde / serde_json** — сериализация

### Хранение данных
- Путь: `~/Library/Application Support/TaseDeck/User/Storage/` (macOS; см. `src-tauri/src/core/fs.rs`)
- Файлы: `database.sqlite`, `master.key` (fallback), настройки приложения
- OS Keychain: сервис `TaseDeck`, ключ `master_encryption_key`

---

## Архитектура приложения

```
┌─────────────────────────────────────────────────────────────┐
│  React UI (src/)                                            │
│  MCP · Projects · Usage · Profile                           │
└──────────────────────────┬──────────────────────────────────┘
                           │ invoke (Tauri commands)
┌──────────────────────────▼──────────────────────────────────┐
│  commands/          — IPC handlers                          │
│  db/                — SQLite CRUD                           │
│  agents/            — провайдеры агентов, mcp.json I/O      │
│  services/          — MCP client, proxy, OAuth, security    │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   SQLite DB      Project folders     MCP Registry API
   (presets,      (.cursor/mcp.json,   (registry.modelcontextprotocol.io)
    servers)       .tasedeck/proxy.mjs)
```

Навигация — **state-based** (`NavId` в `Sidebar.tsx`), без React Router. Активная секция рендерится в `App.tsx` через `display: none/flex`.

**Агенты** не имеют отдельного раздела в UI: записи `agents` в БД создаются при bootstrap и привязываются к проектам через `ProjectDetailView` → `linkProjectAgent`.

---

## MCP Registry — полный пайплайн

### 1. Источник данных

По умолчанию — **официальный registry**:
- URL: `https://registry.modelcontextprotocol.io`
- Запросы идут через Tauri `registry_http_get` (allowlist домена в Rust)
- Параметры: `limit`, `cursor`, `search`, `version=latest`

Опционально (`VITE_USE_MCP_BACKEND=true`):
- Python API `backend/` на `http://localhost:8080/api/v1/mcp/servers`

### 2. Frontend: worker + кэш

```
McpInlineSearch → registrySearch(query)
       ↓
registry.worker.ts (Web Worker)
       ↓
FETCH_REQUEST → registryBridge → fetchCatalogPage()
       ↓
registryFetch.ts → registry_http_get (Tauri) или backend fetch
       ↓
SearchSession { servers, nextCursor, hasMore }
       ↓
filterAndSortEntries() — клиентская фильтрация по title/name
```

- **Пустой запрос**: browse-сессия, пагинация по каталогу
- **С запросом**: API `search` + клиентский фильтр `searchCore.ts` (title, name, short name после `/`)
- Пагинация: `MARKET_PAGE_SIZE`, prefetch соседних страниц

### 3. Установка сервера из registry

```
McpAddButton / install flow
       ↓
mcp_add_from_registry (Rust)
       ↓
mcp_registry_install.rs — разбор packages/remotes из entry
       ↓
mcp_servers row + config_inputs/config_values
       ↓
prepare_proxy_entry (при экспорте в проект)
```

Парсинг конфигурации: `src/services/mcp_registry/parser.ts` — извлечение env, command, transport profiles из registry entry.

---

## OAuth 2.0

### Поток

1. MCP-сервер возвращает `MCP_AUTH_REQUIRED:` → `McpAuthChallenge`
2. UI: `McpOAuthSignInOverlay`
3. `mcp_oauth_start_sign_in` → PKCE, localhost callback `127.0.0.1:{port}/oauth/callback`
4. Браузер открывается через `tauri-plugin-opener`
5. Callback: HTTP listener или deep link `tasedeck://oauth/complete`
6. `mcp_oauth_complete` → обмен code на tokens
7. Токены сохраняются в `config_values` под ключами:
   - `__oauthRefreshToken`
   - `__oauthApiKey`
   - `__oauthClientId`

### Runtime

- `OAuthStore` — in-memory access tokens + refresh
- `proxy_oauth_refresh.rs` — фоновое обновление refresh token для proxy
- Remote MCP transport: `mcp_remote_transport.rs` — Bearer из OAuth session
- События Tauri: `mcp-oauth-sign-in-required`, `mcp-oauth-sign-in-complete`

---

## Безопасное хранение ключей

`src-tauri/src/services/security.rs`:

| Механизм | Описание |
|----------|----------|
| Master key | 32 байта AES-256; OS Keychain или файл `master.key` |
| Шифрование | AES-256-GCM, префикс `enc$` + base64(nonce\|\|ciphertext) |
| `seal_config_values_for_storage` | Шифрует env/secrets перед записью в SQLite |
| `reveal_config_values_for_api` | Расшифровка для UI (маскирование через `mask_secret`) |
| `reveal_config_values_for_runtime` | Расшифровка для spawn proxy / MCP client |

Переключение keyring: `security_set_use_os_keyring` / Profile settings.

Секреты в UI показываются как `abc...xyz`; при сохранении masked-значения не перезаписывают реальный секрет.

---

## Агенты и автопарсинг конфигов

### Builtin-провайдеры (`src-tauri/src/agents/builtin/`)

Поддерживаемые kind: `cursor`, `claude_code`, `vscode`, `opencode`, `windsurf`, `codex_cli`, `antigravity`, `copilot`.

Каждый провайдер знает:
- Пути к config dir (`~/.cursor`, `~/Library/Application Support/...`)
- Имя/путь `mcp.json` (или аналог)

### Bootstrap (`workspace_bootstrap.rs`)

При первом запуске:
1. Сканирует известные пути агентов на диске
2. Создаёт `agents` записи в SQLite
3. Импортирует legacy localStorage projects/presets
4. `finalizeDiscoveredAgents` — ensure mcp.json, default flags

### Чтение/запись mcp.json (`mcp_json.rs`)

- `find_project_mcp_config` — `.cursor/mcp.json`, `.vscode/mcp.json`, …
- `strip_tasedeck_managed_json_entries` — удаляет proxy-записи TaseDeck
- `upsert_proxy_entries_in_project_mcp_json` — добавляет proxy entries
- Маркер TaseDeck: `TASEDECK_PROXY_ENTRY_MARKER` в JSON

---

## Проекты и пресеты — пайплайн

### Модель данных

```
projects
  └── project_preset_assignments     ← default preset (fingerprint: project-{id}-import)
  └── agent_projects                 ← связь agent ↔ project
        └── agent_project_preset_assignments
              └── preset (custom: project-{id}-agent-{agentId})
        └── agent_project_custom_preset_cache
```

### Импорт native MCP (`project_mcp_import.rs`)

При открытии проекта / link agent:
1. `collect_native_project_mcp_servers` — читает `mcp.json` без TaseDeck entries
2. Создаёт/обновляет **default preset** (`project-{id}-import`)
3. Сохраняет snapshot в `default_source_mcp_json` (immutable JSON default)
4. `ensure_mcp_server_from_entry` — регистрирует серверы в `mcp_servers`

### Link agent → custom preset

```
project_record_link_agent
  → import_native_mcp_servers_for_project
  → apply_custom_preset_to_agent (fork servers из default)
```

### Proxy export (`project_proxy_export.rs`)

```
export_project_agent_mcp / sync_project_tasedeck_mcp_merged
  → build_proxy_entries_for_assignment
  → prepare_proxy_entry (sidecar JSON в .tasedeck/mcp/{key}.json)
  → upsert_proxy_entries_in_project_mcp_json
  → bundle proxy.mjs в .tasedeck/proxy.mjs
```

Scopes:
- `SidecarsOnly` — только sidecar-файлы
- `Full` — sidecars + sync `mcp.json`

### Reset agent

`project_record_reset_agent`:
1. Восстанавливает `mcp.json` из `default_source_mcp_json` или `{"mcpServers":{}}`
2. Удаляет custom preset + cache
3. `unlink_agent_project`

### Overrides

`config_overrides` (JSON per agent) — патчи env/args/toolPrefs поверх preset. Хранятся в `agent_project_preset_assignments` и кэшируются для custom preset.

---

## MCP Proxy runtime

Bundled script: `src-tauri/resources/proxy.mjs`

- Запускается как `command` в mcp.json entry
- Читает sidecar `.tasedeck/mcp/{entryKey}.json`
- Проксирует stdio ↔ HTTP/SSE remote MCP
- Логи → `proxy_log_ingest.rs` → `usage_log` таблица

Tool preferences: `mcp_tool_prefs` — enabled/disabled per tool per server.

---

## Тестирование

| Что | Где | Как запустить |
|-----|-----|----------------|
| Market probe CLI | `src-tauri/src/bin/market_probe.rs` | `cargo run --bin market-probe` |
| Market probe script | `test/run-market-probes.mjs` | node test/run-market-probes.mjs |
| Local MCP server | `test_mcp/server.mjs` | `cd test_mcp && npm start` |
| Agent simulation | `test_mcp/simulate-cursor-agent.mjs` | см. `test_mcp/README.md` |
| MCP server test UI | `McpServerTestSection.tsx` | Play в карточке сервера (probe tools) |

Автоматизированных unit/integration тестов в CI **нет** — проверки ручные + market-probe.

---

## Основные Tauri commands (группы)

| Группа | Файл | Примеры |
|--------|------|---------|
| MCP servers | `commands/mcp.rs` | `mcp_add_server`, `mcp_start_server`, `mcp_refresh_tools` |
| MCP OAuth | `commands/mcp_oauth.rs` | `mcp_oauth_start_sign_in`, `mcp_oauth_complete` |
| Projects | `commands/workspace.rs` | `project_record_*`, `preset_record_*` |
| Agents (DB) | `commands/agent_records.rs` | `agent_record_list`, `agent_record_create` |
| Agents (disk) | `commands/agents.rs` | `agents_list_catalog`, `agents_read_mcp_json` |
| Security | `commands/security.rs` | `security_initialize`, `security_mask_secret` |
| Registry HTTP | `commands/registry.rs` | `registry_http_get` |
| Graphs/Topology | `commands/graphs.rs`, `topology.rs` | legacy workspace graph (UI не в main nav) |
| Usage | `commands/usage.rs` | `usage_list_entries` |

---

## Сборка и запуск

```bash
npm install
npm run tauri dev      # dev
npm run tauri build    # production bundle
```

Env (опционально):
- `VITE_USE_MCP_BACKEND=true` — Python backend вместо official registry
- `VITE_MCP_API_BASE=http://localhost:8080`

---

## UI-секции (актуальные)

| NavId | Статус | Описание |
|-------|--------|----------|
| `mcp` | ✅ default | Installed + Market, детальная панель |
| `projects` | ✅ | Проекты, агенты, пресеты, server config |
| `usage` | ✅ | Логи вызовов tools |
| `profile` | ✅ | Тема, keyring, настройки |
| `dashboard` | 🔒 `DASHBOARD_ENABLED=false` | Обзор (lazy) |
| `presets` | 🔒 `PRESETS_ENABLED=false` | Глобальный реестр пресетов |
| ~~`agents`~~ | ❌ удалён | Агенты только внутри Projects |

---

## Ключевые frontend-модули

| Модуль | Путь |
|--------|------|
| Registry search | `src/services/mcp_registry/` |
| Installed MCP | `src/services/mcp_installed/` |
| Projects API | `src/services/projects/` |
| Agent records | `src/services/agents/recordsApi.ts` |
| Session state | `src/session/appSession.ts` |
| Theme tokens | `src/theme.ts` |

---

## Ключевые Rust-модули

| Модуль | Путь |
|--------|------|
| MCP JSON I/O | `src-tauri/src/agents/mcp_json.rs` |
| Project import/export | `project_mcp_import.rs`, `project_proxy_export.rs` |
| MCP client/protocol | `services/mcp_client.rs`, `mcp_protocol.rs` |
| Proxy builder | `services/mcp_proxy.rs` |
| OAuth | `services/oauth2.rs` |
| Security | `services/security.rs` |
| DB schema | `src-tauri/src/db/init.sql` + migrations in `db/mod.rs` |
