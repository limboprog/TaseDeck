import { useCallback, useEffect, useState } from "react";
import {
  createWorkspace,
  getStoredWorkspaces,
  saveWorkspaces,
} from "./storage";
import type { Workspace, WorkspaceDraft } from "./types";

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() =>
    getStoredWorkspaces(),
  );

  useEffect(() => {
    saveWorkspaces(workspaces);
  }, [workspaces]);

  const addWorkspace = useCallback((draft: WorkspaceDraft) => {
    const workspace = createWorkspace(draft);
    setWorkspaces((current) => [workspace, ...current]);
    return workspace;
  }, []);

  return {
    workspaces,
    addWorkspace,
  };
}
