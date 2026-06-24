import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Text, YStack } from "tamagui";
import { colors } from "../theme";

type ToastItem = {
  id: number;
  message: string;
};

const TOAST_DURATION_MS = 7000;

let nextToastId = 1;

export function showAppToast(message: string) {
  window.dispatchEvent(new CustomEvent("tasedeck:show-toast", { detail: { message } }));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string) => {
      const id = nextToastId++;
      setToasts((current) => [...current, { id, message }]);
      window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    },
    [dismissToast],
  );

  useEffect(() => {
    const onShow = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message?.trim();
      if (message) {
        pushToast(message);
      }
    };
    window.addEventListener("tasedeck:show-toast", onShow);
    return () => window.removeEventListener("tasedeck:show-toast", onShow);
  }, [pushToast]);

  if (toasts.length === 0) {
    return null;
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 100000,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 360,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <YStack
          key={toast.id}
          bg={colors.surface}
          borderWidth={1}
          borderColor={colors.border}
          px={14}
          py={12}
          style={{
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            pointerEvents: "auto",
          }}
        >
          <Text color={colors.foreground} fontSize={13} lineHeight={18} select="none">
            {toast.message}
          </Text>
        </YStack>
      ))}
    </div>,
    document.body,
  );
}
