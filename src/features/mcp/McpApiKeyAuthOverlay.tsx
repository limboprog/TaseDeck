import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GoSignIn, IoClose } from "../../icons";
import { GlassPanel } from "../../components/Glass/GlassPanel";
import {
  setMcpApiKey,
  type McpAuthChallenge,
} from "../../services/mcp_installed/oauthApi";
import { openExternal } from "../../utils/openExternal";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import { Button, XStack } from "tamagui";

type McpApiKeyAuthOverlayProps = {
  challenge: McpAuthChallenge;
  onClose: () => void;
  onAuthenticated?: () => void;
};

function tokenHelpUrl(challenge: McpAuthChallenge): string | null {
  const fromAuth = challenge.authorizationUrl?.trim();
  if (fromAuth) {
    return fromAuth;
  }
  const endpoint = challenge.endpoint?.trim();
  return endpoint || null;
}

export function McpApiKeyAuthOverlay({
  challenge,
  onClose,
  onAuthenticated,
}: McpApiKeyAuthOverlayProps) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const helpUrl = tokenHelpUrl(challenge);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      return;
    }
    setBusy(true);
    try {
      await setMcpApiKey(challenge.serverId, trimmed);
      onAuthenticated?.();
    } catch {
      // Keep overlay open; user can retry or close.
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(360px, 100%)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <GlassPanel
          glow
          rounded={12}
          overflow="hidden"
          p={0}
          borderWidth={1}
          borderColor={borders.default}
        >
          <div style={{ position: "relative", padding: "28px 24px 24px" }}>
            <Button
              unstyled
              position="absolute"
              t={12}
              r={12}
              width={30}
              height={30}
              rounded={8}
              hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
              onPress={onClose}
              aria-label="Close token dialog"
            >
              <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
                <IoClose size={18} />
              </XStack>
            </Button>

            <XStack
              items="center"
              justify="center"
              gap={8}
              mb={16}
              pr={36}
              style={{ color: colors.muted }}
            >
              <GoSignIn size={18} />
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 400,
                  lineHeight: 1.35,
                  textAlign: "center",
                }}
              >
                Get token for authentication
              </span>
            </XStack>

            <textarea
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste one or more tokens"
              rows={3}
              disabled={busy}
              style={{
                width: "100%",
                boxSizing: "border-box",
                margin: "0 0 12px",
                padding: "10px 12px",
                border: `1px solid ${tamaguiSurfaces.controlBorder}`,
                borderRadius: 8,
                background: tamaguiSurfaces.controlBg,
                color: colors.foreground,
                fontSize: 12,
                lineHeight: 1.45,
                fontFamily: "ui-monospace, monospace",
                resize: "vertical",
                minHeight: 72,
                opacity: busy ? 0.65 : 1,
              }}
            />

            {helpUrl ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void openExternal(helpUrl);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  margin: "0 0 16px",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: colors.accent,
                  fontSize: 12,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  textAlign: "center",
                  cursor: busy ? "default" : "pointer",
                  fontFamily: "inherit",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  opacity: busy ? 0.55 : 1,
                }}
              >
                Where to get a token
              </button>
            ) : null}

            <button
              type="button"
              disabled={busy || !token.trim()}
              onClick={() => {
                void handleSubmit();
              }}
              onMouseEnter={(event) => {
                if (!busy && token.trim()) {
                  event.currentTarget.style.opacity = "0.85";
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.opacity = busy || !token.trim() ? "0.55" : "1";
              }}
              style={{
                width: "100%",
                height: 36,
                margin: 0,
                padding: "0 14px",
                border: "none",
                borderRadius: 8,
                background: colors.accent,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                lineHeight: "36px",
                cursor: busy || !token.trim() ? "default" : "pointer",
                opacity: busy || !token.trim() ? 0.55 : 1,
                fontFamily: "inherit",
                transition: "opacity 120ms ease",
              }}
            >
              {busy ? "…" : "Continue"}
            </button>
          </div>
        </GlassPanel>
      </div>
    </div>,
    document.body,
  );
}
