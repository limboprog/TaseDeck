import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectConfigOverrides } from "../../services/projects/projectOverrides";

export type ServerSettingsHistoryEntry = {
  draftOverridesByAgent: Record<number, ProjectConfigOverrides>;
};

function cloneOverridesByAgent(
  source: Record<number, ProjectConfigOverrides>,
): Record<number, ProjectConfigOverrides> {
  return JSON.parse(JSON.stringify(source)) as Record<number, ProjectConfigOverrides>;
}

export function captureServerSettingsSnapshot(
  draftOverridesByAgent: Record<number, ProjectConfigOverrides>,
): ServerSettingsHistoryEntry {
  return {
    draftOverridesByAgent: cloneOverridesByAgent(draftOverridesByAgent),
  };
}

export function useProjectServerSettingsHistory(projectId: string) {
  const pastRef = useRef<ServerSettingsHistoryEntry[]>([]);
  const futureRef = useRef<ServerSettingsHistoryEntry[]>([]);
  const draftOverridesByAgentRef = useRef<Record<number, ProjectConfigOverrides>>({});
  const applyingRef = useRef(false);
  const [revision, setRevision] = useState(0);

  const bump = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const reset = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, [bump]);

  useEffect(() => {
    reset();
  }, [projectId, reset]);

  const bindSnapshotSources = useCallback(
    (draftOverridesByAgent: Record<number, ProjectConfigOverrides>) => {
      draftOverridesByAgentRef.current = draftOverridesByAgent;
    },
    [],
  );

  const pushBeforeChange = useCallback(() => {
    if (applyingRef.current) {
      return;
    }
    pastRef.current.push(captureServerSettingsSnapshot(draftOverridesByAgentRef.current));
    futureRef.current = [];
    bump();
  }, [bump]);

  const makeStep = useCallback(
    (direction: "undo" | "redo") => {
      const source = direction === "undo" ? pastRef.current : futureRef.current;
      const target = direction === "undo" ? futureRef.current : pastRef.current;
      if (source.length === 0) {
        return null;
      }

      applyingRef.current = true;
      target.push(captureServerSettingsSnapshot(draftOverridesByAgentRef.current));
      const next = source.pop()!;
      applyingRef.current = false;
      bump();
      return next;
    },
    [bump],
  );

  const canUndo = useMemo(() => pastRef.current.length > 0, [revision]);
  const canRedo = useMemo(() => futureRef.current.length > 0, [revision]);

  return {
    revision,
    canUndo,
    canRedo,
    reset,
    bindSnapshotSources,
    pushBeforeChange,
    stepUndo: useCallback(() => makeStep("undo"), [makeStep]),
    stepRedo: useCallback(() => makeStep("redo"), [makeStep]),
    isApplying: () => applyingRef.current,
  };
}
