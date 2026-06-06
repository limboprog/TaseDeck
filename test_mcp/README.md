# TaseDeck Test MCP — пошаговая настройка

Локальный сервер для проверки: **подключение**, **run command / аргументы**, **список tools**, **логи** в stderr.

## Быстрый старт (если «Database error» при Create)

1. **Перезапустите TaseDeck** — остановите `npm run tauri dev` (`Ctrl+C`) и запустите снова. Без перезапуска старая версия Rust всё ещё требует `path` и падает с `Database error`.
2. В терминале из папки `test_mcp` выполните `./print-setup.sh` — скопируйте строку `node …/server.mjs`.
3. В приложении: **MCP → +** → имя → **Enter** → **Run commands → stdio → Command** → вставьте эту строку → **Create**.
4. Раскройте карточку → блок **Tools** → должно быть **6 tools**.

Если после перезапуска ошибка остаётся — в **Command** обязательно должна быть непустая строка (см. шаг 2 ниже). Пустая команда даёт другую ошибку: `path or run_command is required…`.

---

## 0. Проверка, что сервер вообще живой

В терминале (замените путь на свой):

```bash
cd /Users/leonidborodin/Documents/programming/antigravity/TaseDeck/test_mcp
node server.mjs
```

Должна появиться строка вроде:

```text
[tasedeck-test-mcp] ... INFO server started {"tools":["echo_message",...]}
```

Остановка: `Ctrl+C`.

Узнать **абсолютный путь** к скрипту (понадобится в TaseDeck):

```bash
cd /Users/leonidborodin/Documents/programming/antigravity/TaseDeck/test_mcp
pwd
# запомните: <эта_папка>/server.mjs
```

Пример пути:

```text
/Users/leonidborodin/Documents/programming/antigravity/TaseDeck/test_mcp/server.mjs
```

---

## 1. Добавление в TaseDeck (MCP → +)

### Шаг 1 — карточка

1. Откройте раздел **MCP** в приложении (`npm run tauri dev`).
2. Нажмите **+** (справа от поиска).
3. В шапке новой карточки введите имя, например: `TaseDeck Test MCP`.
4. Нажмите **Enter** — карточка раскроется.

### Шаг 2 — Run commands (stdio)

В блоке **Run commands** должен быть профиль **stdio** (выбран radio).

**Вариант A — одна строка Command (проще всего)**

1. Подпись **Command** → таблица **bash**.
2. В поле команды вставьте **целиком** (свой путь):

   ```bash
   node /Users/leonidborodin/Documents/programming/antigravity/TaseDeck/test_mcp/server.mjs
   ```

3. Секцию **Arguments** можно не трогать.

**Вариант B — Command + Arguments**

1. **Command:** только слово `node` (без пути).
2. **Arguments** → **Add**:
   - **Name:** полный путь к `server.mjs` (как в примере выше).
   - **Toggle:** включён.
   - **Value:** пусто.

### Шаг 3 — переменные (необязательно)

**Environment variables** → **Add** в заголовке таблицы:

| Name | Identificator | Token |
|------|---------------|-------|
| Test env | `TASEDECK_TEST_ENV` | `hello` |

Нужно для tool `read_env_sample`. Можно пропустить.

### Шаг 4 — сохранить

1. Кнопка **Create** (или **Save**) в шапке карточки — должна стать активной после заполнения команды.
2. Если ошибка — см. раздел **Ошибки** ниже.

### Шаг 5 — tools

1. Раскройте карточку (если свернулась).
2. Прокрутите до **Tools**.
3. Должно подключиться и показать **6 tools**:  
   `echo_message`, `add_numbers`, `list_items`, `get_status`, `read_env_sample`, `log_message`.

Если Tools пишет ошибку подключения — смотрите stderr (раздел **Логи**).

---

## 2. Ошибки

### `Database error: ... path is required...` или `path or run_command is required...`

| Текст ошибки | Что не так | Действие |
|--------------|------------|----------|
| `path is required` | Запущена **старая** сборка TaseDeck | Полностью перезапустить `npm run tauri dev` |
| `path or run_command is required` | **Command** пустой | Вставить `node /полный/путь/server.mjs` (см. `./print-setup.sh`) |

**Причина (старая версия):** для `local` в БД требовался только `path`, у ручного MCP его не было.

**Сейчас:** достаточно **непустой команды** в Run commands; отдельный package path для test MCP не нужен.

**Чеклист:**

1. `Ctrl+C` в терминале с TaseDeck → снова `npm run tauri dev`.
2. `./print-setup.sh` → скопировать строку `node …`.
3. MCP → + → Command → **Create**.

### `run_command and json_config are empty`

Заполните поле **Command** (вариант A или B выше). Без команды TaseDeck не знает, что запускать.

### Tools: `timed out` / `initialize failed` / `stderr: ...`

1. Проверьте путь к `server.mjs` в терминале:  
   `node /полный/путь/server.mjs` — должен стартовать без ошибки.
2. В Command используйте **`node`**, путь — отдельным аргументом или в одной строке с `node`.
3. На macOS должен быть установлен Node.js (`node -v` в терминале).

### `Server is not fully configured yet`

Заполните обязательные **Environment variables**, если в карточке есть поля с `*` (для test MCP обычно не требуется).

---

## 3. Логи

Сервер пишет в **stderr** (не в UI TaseDeck пока):

```text
[tasedeck-test-mcp] 2026-... INFO request {"id":1,"method":"initialize"}
[tasedeck-test-mcp] ... INFO tools/call {"name":"echo_message",...}
```

Отладка вручную:

```bash
cd test_mcp
npm start
```

Просмотр stderr процесса из TaseDeck — в терминале, где запущен `npm run tauri dev` (если процесс наследует вывод).

---

## 4. Tools (справка)

| Tool | Аргументы |
|------|-----------|
| `echo_message` | `message` (string) |
| `add_numbers` | `a`, `b` (number) |
| `list_items` | `items` (array), `separator` (optional) |
| `get_status` | без обязательных |
| `read_env_sample` | нужен env `TASEDECK_TEST_ENV` |
| `log_message` | `message` (string), `level` optional (`INFO` / `WARN` / `ERROR`) — пишет в stderr |

---

## 5. Симуляция агента Cursor → агрегатор топологии

Проверяет полный путь, как у Cursor после **Play** на топологии:

1. `tools/list` — мета-tools агрегатора (`list_servers`, `tools`, `call_tool`)
2. `call_tool list_servers` — список активных MCP в топологии
3. `call_tool tools` — tools у test MCP (по имени, содержащему `test`)
4. `call_tool call_tool` — вызов `log_message` (или `echo_message` как fallback)

**Подготовка:**

1. test MCP добавлен в TaseDeck и связан с агентом на графе (ребро включено, сервер active).
2. На топологии нажат **Play** — bridge поднят.
3. Узнайте порт из статуса топологии или из `mcp.json` агента: `TASEDECK_BRIDGE_PORT`.

```bash
cd test_mcp
export TASEDECK_BRIDGE_PORT=60382   # ваш порт
npm run simulate-agent
# или
./simulate-agent.sh
```

Опционально:

| Env | Значение |
|-----|----------|
| `TEST_MCP_SERVER_NAME` | подстрока в имени сервера (по умолчанию `test`) |
| `TASEDECK_TOPOLOGY_ID` | метка в логах агрегатора |
| `TASEDECK_AGGREGATOR_PATH` | путь к `topology_aggregator.mjs` |

В stderr `npm run tauri dev` должны появиться строки `[tasedeck-test-mcp] … log_message …`.

---

## 6. Файлы

| Файл | Назначение |
|------|------------|
| `server.mjs` | MCP stdio сервер |
| `simulate-cursor-agent.mjs` | симуляция Cursor → агрегатор → test MCP |
| `mcp_stdio_client.mjs` | минимальный MCP stdio клиент для скриптов |
| `run.sh` | то же: `./run.sh` |
| `simulate-agent.sh` | обёртка с проверкой `TASEDECK_BRIDGE_PORT` |
| `package.json` | `npm start`, `npm run simulate-agent` |
| `print-setup.sh` | выводит готовую команду для вставки в TaseDeck |

Быстрая подсказка в терминале:

```bash
./print-setup.sh
```
