import { useEffect } from "react";
import {
  formatProjectDiskJobFailedToast,
  listenProjectDiskJobCompleted,
  listenProjectDiskJobFailed,
} from "../services/projects/diskJobEvents";
import { showAppToast } from "./ToastHost";

export function ProjectDiskJobFailureListener() {
  useEffect(() => {
    let cancelled = false;
    let unlistenFailed: (() => void) | undefined;
    let unlistenCompleted: (() => void) | undefined;

    void listenProjectDiskJobFailed((payload) => {
      if (cancelled) {
        return;
      }
      const agentName = payload.agentName.trim() || "Agent";
      showAppToast(formatProjectDiskJobFailedToast(agentName));
    }).then((dispose) => {
      if (cancelled) {
        dispose();
        return;
      }
      unlistenFailed = dispose;
    });

    void listenProjectDiskJobCompleted(() => {
      // Completion is handled per-project in ProjectDetailView.
    }).then((dispose) => {
      if (cancelled) {
        dispose();
        return;
      }
      unlistenCompleted = dispose;
    });

    return () => {
      cancelled = true;
      unlistenFailed?.();
      unlistenCompleted?.();
    };
  }, []);

  return null;
}
