агенты: claude opencode cursor...
mcp: ...
tools: ...
skills: ...




background: "rgb(8, 8, 8)",
  /** config: `panel` */
  panel: "#0F0F0F",
  /** config: PANEL_BG / `#141414` */
  panelBg: "#141414",
  /** совместимость: карточка = панель */
  card: "#0F0F0F",
  /** совместимость: альтернативная плоскость = PANEL_BG */
  cardAlt: "#141414",
  input: "#1A2335",
  border: "#252F44",
  foreground: "rgb(209, 215, 222)",
  muted: "#94A3B8",












export const colors = {
  background: "#101112",
  surface: "#121314",
  border: "rgba(64, 65, 66, 0.5)",
  foreground: "rgb(232, 234, 237)",
  muted: "#8B9199",
  accent: "#8B5CF6",
  glassFillTop: "rgba(24, 25, 27, 0.58)",
  glassFillBottom: "rgba(16, 17, 18, 0.72)",
  glassBorder: "rgba(64, 65, 66, 0.45)",
  glassInnerGlow: "rgba(36, 38, 42, 0.35)",
  glassInnerDepth: "rgba(8, 9, 10, 0.45)",
  glassEdgeTop: "rgba(255, 255, 255, 0.03)",
} as const;

export const glassSurfaceStyle = {
  background: `linear-gradient(180deg, ${colors.glassFillTop} 0%, ${colors.glassFillBottom} 100%)`,
  backdropFilter: "blur(20px) saturate(105%)",
  WebkitBackdropFilter: "blur(0px) saturate(105%)",
  boxShadow: [
    `inset 0 1px 0 ${colors.glassEdgeTop}`,
    "inset 0 0 0 1px rgba(255, 255, 255, 0.015)",
    `inset 0 0 40px ${colors.glassInnerGlow}`,
    `inset 0 0 100px ${colors.glassInnerDepth}`,
    "0 12px 36px rgba(0, 0, 0, 0.32)",
  ].join(", "),
} as const;

export const glassGlowStyle = {
  background:
    "radial-gradient(ellipse 100% 55% at 50% 0%, rgba(42, 44, 48, 0.2) 0%, transparent 62%)",
} as const;











1) сделай так, чтобы при прокрутке серверов поиск и + оставались на месте вверху, добавь перед ними панель где будет поверх переход прозраночти от 0 до 100 чтобы пир прокрутке блоки плавно исчезали
2) создай окно агента в похожем стиле, что и сервера, пока что из настроек внутри есть путь к папке и добавление агента работает по тому же принципу, это ввод имени уже в блоке и затем указание пути, только при вводе имени есть выплывающее меню где есть заранее поддерживаемые агенты это cursor claude code antigravity copilot для них как и сейчас сначала происходит автоматический поиск пути по предпологаемому месту если там нет, то пользователь сам вводит используя стандартное окно системв для выбора папки











1. OAuth Client Credentials (машина-машина)

Некоторые серверы не требуют пользователя вообще — только client_id + client_secret:

bash
curl -X POST https://auth.server.com/token \
  -d "grant_type=client_credentials" \
  -d "client_id=xxx" \
  -d "client_secret=yyy"
Сейчас: Не обрабатывается.
Надо: Добавить AuthType::ClientCredentials.

2. Bearer token в query string (некоторые API)

Не все серверы принимают токен в заголовке Authorization. Некоторые хотят:

text
GET /mcp?access_token=xyz
Сейчас: Только header.
Надо: Проверять bearer_methods_supported из metadata.

3. OAuth без PKCE (старые серверы, 2024 и раньше)

Некоторые серверы не поддерживают code_challenge_method=S256.

Сейчас: Только PKCE.
Надо: Проверять code_challenge_methods_supported и падать на plain если надо.

4. Разные scopes для разных операций

Сейчас вы запрашиваете все scopes разом. Но некоторые серверы требуют разные токены для разных действий.

Сейчас: Один токен на всё.
Надо: Хранить токены с привязкой к scope.

5. Token revocation (отзыв токенов)

Пользователь может в панели управления отозвать токен. Ваш Hub узнает об этом только при следующем 401.

Сейчас: Просто повторный OAuth.
Надо: Периодически проверять или явный endpoint /revoke.

6. DPoP (OAuth-дополнение для безопасности)

Некоторые серверы требуют DPoP (Demonstrated Proof-of-Possession) — подпись каждого запроса.

Сейчас: Нет.
Надо: Пока редкое, но может появиться.

7. Multiple authorization servers

В metadata может быть несколько authorization_servers. Вы берете первый.

Сейчас: first().
Надо: Пробовать по очереди.

8. Разные форматы expires_at

У некоторых в expires_in (секунды)
У некоторых в expires_at (timestamp)
У некоторых нет вообще (бесконечный токен)
Сейчас: expires_in.
Надо: Проверять оба варианта.

9. Перенаправление на другой порт (не 8080)

Порт 8080 может быть занят. Ваш callback сервер упадет.

Сейчас: localhost:8080 жестко.
Надо: Искать свободный порт динамически.

10. Токены с разными правами (привязка к ip/device)

Некоторые серверы (Apple, Google) выдают токены, привязанные к IP или device ID. При смене IP (VPN, переезд) токен перестает работать.

Сейчас: Не обрабатывается.
Надо: Сохранять метаданные о токене, при ошибке — переавторизация.



добавить учет уже существующего конфига 