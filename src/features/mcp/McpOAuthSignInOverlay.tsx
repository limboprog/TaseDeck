import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GoSignIn, IoClose } from "../../icons";
import { GlassPanel } from "../../components/Glass/GlassPanel";
import { startMcpOAuthSignIn, type McpAuthChallenge } from "../../services/mcp_installed/oauthApi";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import { Button, XStack } from "tamagui";

type McpOAuthSignInOverlayProps = {
  challenge: McpAuthChallenge;
  onClose: () => void;
  onAuthenticated?: () => void;
};

export function McpOAuthSignInOverlay({
  challenge,
  onClose,
  onAuthenticated,
}: McpOAuthSignInOverlayProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleOpenPage = async () => {
    setBusy(true);
    setError(null);
    try {
      await startMcpOAuthSignIn(challenge.serverId);
      onAuthenticated?.();
    } catch (signInError) {
      const message =
        signInError instanceof Error ? signInError.message : "OAuth sign-in failed";
      setError(message);
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
              aria-label="Close sign-in dialog"
            >
              <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
                <IoClose size={18} />
              </XStack>
            </Button>

            <XStack
              items="center"
              justify="center"
              gap={8}
              mb={20}
              pr={36}
              style={{ color: colors.muted }}
            >
              <GoSignIn size={18} />
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 400,
                  lineHeight: 1.35,
                }}
              >
                Please sign in to continue
              </span>
            </XStack>

            {error ? (
              <p
                style={{
                  margin: "0 0 12px",
                  color: colors.error,
                  fontSize: 12,
                  lineHeight: 1.4,
                  wordBreak: "break-word",
                }}
              >
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void handleOpenPage();
              }}
              onMouseEnter={(event) => {
                if (!busy) {
                  event.currentTarget.style.opacity = "0.85";
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.opacity = busy ? "0.55" : "1";
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
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.55 : 1,
                fontFamily: "inherit",
                transition: "opacity 120ms ease",
              }}
            >
              {busy ? "…" : "Open page"}
            </button>
          </div>
        </GlassPanel>
      </div>
    </div>,
    document.body,
  );
}
