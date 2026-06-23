import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, YStack } from "tamagui";
import { ProjectGitTreeRail } from "../../components/ProjectGitTreeRail";
import { PANE_ROW_PADDING } from "../../components/pane/paneStyles";
import { mergeLayoutClass, layoutClasses } from "../../styles/layout";
import { useInstalledMcpServers } from "../../services/mcp_installed";
import { listAgentRecords } from "../../services/agents/recordsApi";
import {
  createPresetRecord,
  tryDeletePresetRecord,
  updatePresetRecord,
  listPresetRecords,
} from "../../services/presets/recordsApi";
import { notifyPresetsChanged, PRESETS_CHANGED_EVENT } from "../../services/presets/storage";
import type { Preset } from "../../services/presets";
import {
  addProjectServer,
  assignProjectPreset,
  deleteProjectCustomPreset,
  exportProjectProxyConfig,
  getAgentAssignment,
  getProjectDetail,
  linkProjectAgent,
  removeProjectServer,
  resetProjectAgent,
  resolveAgentPresetMode,
  updateProjectAssignmentOverrides,
  useProjectCustomPreset,
  useProjectDefaultPreset,
  type ProjectDetail,
} from "../../services/projects/detailApi";
import {
  mergeServerOverridePatch,
  parseProjectConfigOverrides,
  serializeProjectConfigOverrides,
  stripServerOverrideKeys,
  type ProjectConfigOverrides,
  type ProjectServerOverridePatch,
} from "../../services/projects/projectOverrides";
import { PROJECTS_CHANGED_EVENT, notifyProjectsChanged } from "../../services/projects/recordsApi";
import { notifyMcpCatalogChanged } from "../../services/mcp_installed/types";
import { replaceMcpToolEnabledMap } from "../../services/mcp_installed/mcpToolPreferences";
import { colors } from "../../theme";
import { ProjectAddAgentRow } from "./ProjectAddAgentRow";
import { ProjectAgentBranch } from "./ProjectAgentBranch";
import { ProjectPresetActions } from "./ProjectPresetActions";
import { ProjectAgentPicker } from "./ProjectAgentPicker";
import { ProjectDetailHeader } from "./ProjectDetailHeader";
import { ProjectNavigationPanel, NAV_PANEL_WIDTH } from "./ProjectNavigationPanel";
import {
  PROJECT_AGENT_BRANCH_INDENT,
  PROJECT_HEADER_PADDING_BOTTOM,
  PROJECT_HEADER_PADDING_TOP,
  PROJECT_SERVER_EXPAND_RIGHT,
  PROJECT_TREE_HEADER_SPACER,
} from "./projectLayout";
import { useProjectAgentTree } from "./useProjectAgentTree";
import { useProjectNavigationState } from "./useProjectNavigationState";
import {
  type ServerSettingsHistoryEntry,
  useProjectServerSettingsHistory,
} from "./useProjectServerSettingsHistory";
import { resetScrollContainer, runPreservingScroll } from "./projectScroll";
import {
  readProjectDetailUiSession,
  writeProjectDetailUiSession,
} from "../../session/appSession";

type ProjectDetailViewProps = {
  projectId: string;
};

const TREE_RAIL_WIDTH = 20;
const TREE_CONTENT_INDENT =
  PANE_ROW_PADDING + TREE_RAIL_WIDTH + 6 + PROJECT_AGENT_BRANCH_INDENT;
const AGENT_BRANCH_GAP = 22;

export function ProjectDetailView({ projectId }: ProjectDetailViewProps) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [committedOverridesByAgent, setCommittedOverridesByAgent] = useState<
    Record<number, ProjectConfigOverrides>
  >({});
  const [draftOverridesByAgent, setDraftOverridesByAgent] = useState<
    Record<number, ProjectConfigOverrides>
  >({});
  const [allAgents, setAllAgents] = useState<Awaited<ReturnType<typeof listAgentRecords>>>([]);
  const [addServerAgentId, setAddServerAgentId] = useState<number | null>(null);
  const [toolsHistoryToken, setToolsHistoryToken] = useState(0);
  const [expandedServerKeys, setExpandedServerKeys] = useState<Set<string>>(() => {
    const session = readProjectDetailUiSession(projectId);
    return new Set(session.expandedServerKeys ?? []);
  });
  const [addAgentExpanded, setAddAgentExpanded] = useState(
    () => readProjectDetailUiSession(projectId).addAgentExpanded ?? false,
  );
  const [savedPresets, setSavedPresets] = useState<Preset[]>([]);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const agentSectionRefs = useRef(new Map<number, HTMLDivElement>());
  const localProjectsChangeRef = useRef(false);
  const agentOverrideHandlersRef = useRef(
    new Map<number, (serverKey: string, patch: ProjectServerOverridePatch) => void>(),
  );
  const { servers: installedServers } = useInstalledMcpServers();
  const {
    canUndo: canUndoSettings,
    canRedo: canRedoSettings,
    reset: resetSettingsHistory,
    bindSnapshotSources,
    pushBeforeChange,
    stepUndo,
    stepRedo,
  } = useProjectServerSettingsHistory(projectId);
  const pushBeforeSettingChangeRef = useRef(pushBeforeChange);
  pushBeforeSettingChangeRef.current = pushBeforeChange;

  const syncDetail = useCallback(async (options?: { silent?: boolean; preserveHistory?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const [next, agents] = await Promise.all([
        getProjectDetail(projectId),
        listAgentRecords(),
      ]);
      setDetail(next);
      setAllAgents(agents);
      if (next?.nativeMcpImported) {
        notifyMcpCatalogChanged();
      }
      if (next) {
        const nextOverrides: Record<number, ProjectConfigOverrides> = {};
        for (const entry of next.agentAssignments ?? []) {
          nextOverrides[entry.agentId] = parseProjectConfigOverrides(
            entry.assignment?.configOverrides ?? "{}",
          );
        }
        setCommittedOverridesByAgent(nextOverrides);
        if (!options?.preserveHistory) {
          setDraftOverridesByAgent({});
          resetSettingsHistory();
        }
      } else {
        setCommittedOverridesByAgent({});
        if (!options?.preserveHistory) {
          setDraftOverridesByAgent({});
          resetSettingsHistory();
        }
      }
    } catch (cause) {
      console.error("Failed to load project detail", cause);
      if (!options?.silent) {
        setDetail(null);
        setAllAgents([]);
        setCommittedOverridesByAgent({});
        setDraftOverridesByAgent({});
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [projectId, resetSettingsHistory]);

  useEffect(() => {
    void syncDetail();
  }, [syncDetail]);

  useEffect(() => {
    const refreshPresets = () => {
      void listPresetRecords().then(setSavedPresets);
    };
    refreshPresets();
    window.addEventListener(PRESETS_CHANGED_EVENT, refreshPresets);
    return () => window.removeEventListener(PRESETS_CHANGED_EVENT, refreshPresets);
  }, []);

  useEffect(() => {
    const onChanged = () => {
      if (localProjectsChangeRef.current) {
        localProjectsChangeRef.current = false;
        return;
      }
      void syncDetail({ silent: true, preserveHistory: true });
    };
    window.addEventListener(PROJECTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, onChanged);
  }, [syncDetail]);

  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    scrollRestoredRef.current = false;
  }, [projectId]);

  useEffect(() => {
    const node = scrollRootRef.current;
    if (!node) {
      return;
    }
    const onScroll = () => {
      writeProjectDetailUiSession(projectId, {
        ...readProjectDetailUiSession(projectId),
        scrollTop: node.scrollTop,
      });
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [detail, loading, projectId]);

  const emitProjectsChanged = useCallback(() => {
    localProjectsChangeRef.current = true;
    notifyProjectsChanged();
  }, []);

  const agents = detail?.agents ?? [];
  const agentIds = useMemo(() => agents.map((agent) => agent.id), [agents]);

  useEffect(() => {
    bindSnapshotSources(draftOverridesByAgent);
  }, [bindSnapshotSources, draftOverridesByAgent]);

  const applyHistoryEntry = useCallback((entry: ServerSettingsHistoryEntry) => {
    setDraftOverridesByAgent(entry.draftOverridesByAgent);
    setToolsHistoryToken((value) => value + 1);
  }, []);

  const handleUndoSettings = useCallback(() => {
    const entry = stepUndo();
    if (entry) {
      applyHistoryEntry(entry);
    }
  }, [applyHistoryEntry, stepUndo]);

  const handleRedoSettings = useCallback(() => {
    const entry = stepRedo();
    if (entry) {
      applyHistoryEntry(entry);
    }
  }, [applyHistoryEntry, stepRedo]);

  const historyBurstRef = useRef(false);
  const historyBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDraftOverrideChange = useCallback(
    (agentId: number, serverKey: string, patch: ProjectServerOverridePatch) => {
      if (!historyBurstRef.current) {
        pushBeforeSettingChangeRef.current();
        historyBurstRef.current = true;
      }
      if (historyBurstTimerRef.current) {
        clearTimeout(historyBurstTimerRef.current);
      }
      historyBurstTimerRef.current = setTimeout(() => {
        historyBurstRef.current = false;
      }, 600);

      setDraftOverridesByAgent((current) => ({
        ...current,
        [agentId]: mergeServerOverridePatch(current[agentId] ?? {}, serverKey, patch),
      }));
    },
    [],
  );

  const handleSaveToProject = useCallback(
    (agentId: number, serverKey: string, patch: ProjectServerOverridePatch) => {
      setCommittedOverridesByAgent((current) => {
        const nextCommitted = mergeServerOverridePatch(
          current[agentId] ?? {},
          serverKey,
          patch,
        );

        void (async () => {
          try {
            const saved = await updateProjectAssignmentOverrides(
              projectId,
              agentId,
              serializeProjectConfigOverrides(nextCommitted),
            );
            if (!saved) {
              console.error("Project overrides were not saved");
              return;
            }
            await exportProjectProxyConfig(projectId, agentId);
            emitProjectsChanged();
          } catch (cause) {
            console.error("Failed to save project assignment overrides", cause);
            void syncDetail({ silent: true, preserveHistory: true });
          }
        })();

        return { ...current, [agentId]: nextCommitted };
      });
      setDraftOverridesByAgent((current) => {
        const agentDraft = { ...(current[agentId] ?? {}) };
        delete agentDraft[serverKey];
        return { ...current, [agentId]: agentDraft };
      });
    },
    [emitProjectsChanged, projectId, syncDetail],
  );

  const getAgentSectionElement = useCallback(
    (agentId: number) => agentSectionRefs.current.get(agentId) ?? null,
    [],
  );

  const { navigation, remeasureNavigation, clampScroll, selectAgent } = useProjectNavigationState({
    scrollRootRef,
    agentIds,
    getSectionElement: getAgentSectionElement,
    enabled: Boolean(detail && !loading && agentIds.length > 0),
    resetKey: projectId,
  });

  const handleAddServer = useCallback(
    (agentId: number, mcpServerId: number) => {
      if (detail && resolveAgentPresetMode(detail, agentId) === "default") {
        return;
      }

      const assignment = detail ? getAgentAssignment(detail, agentId) : null;
      const currentIds = assignment?.servers.map((entry) => entry.server.id) ?? [];
      if (currentIds.includes(mcpServerId)) {
        return;
      }

      const installed = installedServers.find((server) => server.id === mcpServerId);
      if (!installed) {
        return;
      }

      const serverKey = installed.name.trim() || `mcp-server-${installed.id}`;
      setAddServerAgentId(null);
      runPreservingScroll(scrollRootRef.current, () => {
        setDetail((current) => {
          if (!current) {
            return current;
          }
          const existing = getAgentAssignment(current, agentId);
          const nextAssignment = existing
            ? {
                ...existing,
                servers: [...existing.servers, { serverKey, server: installed }],
              }
            : {
                presetId: 0,
                presetName: current.project.name,
                configOverrides: "{}",
                servers: [{ serverKey, server: installed }],
              };
          return {
            ...current,
            agentAssignments: (current.agentAssignments ?? []).map((entry) =>
              entry.agentId === agentId ? { ...entry, assignment: nextAssignment } : entry,
            ),
          };
        });
      });

      void addProjectServer(projectId, agentId, mcpServerId)
        .then((assignment) => {
          runPreservingScroll(scrollRootRef.current, () => {
            setDetail((current) =>
              current
                ? {
                    ...current,
                    agentAssignments: (current.agentAssignments ?? []).map((entry) =>
                      entry.agentId === agentId
                        ? { ...entry, assignment, hasCustomPreset: true }
                        : entry,
                    ),
                  }
                : current,
            );
          });
          setCommittedOverridesByAgent((current) => ({
            ...current,
            [agentId]: parseProjectConfigOverrides(assignment.configOverrides),
          }));
          setDraftOverridesByAgent((current) => {
            const agentDraft = { ...(current[agentId] ?? {}) };
            delete agentDraft[serverKey];
            return { ...current, [agentId]: agentDraft };
          });
          if (mcpServerId > 0) {
            replaceMcpToolEnabledMap(mcpServerId, {});
          }
        })
        .catch((cause) => {
          console.error("Failed to add server to project", cause);
          void syncDetail({ silent: true });
        });
    },
    [detail, installedServers, projectId, syncDetail],
  );

  const handleRemoveServer = useCallback(
    (agentId: number, mcpServerId: number) => {
      const assignment = detail ? getAgentAssignment(detail, agentId) : null;
      if (!assignment) {
        return;
      }

      const removedEntry = assignment.servers.find((entry) => entry.server.id === mcpServerId);
      const removedServerKey = removedEntry?.serverKey;

      runPreservingScroll(scrollRootRef.current, () => {
        setDetail((current) =>
          current
            ? {
                ...current,
                agentAssignments: (current.agentAssignments ?? []).map((entry) =>
                  entry.agentId === agentId && entry.assignment
                    ? {
                        ...entry,
                        assignment: {
                          ...entry.assignment,
                          servers: entry.assignment.servers.filter(
                            (serverEntry) => serverEntry.server.id !== mcpServerId,
                          ),
                        },
                      }
                    : entry,
                ),
              }
            : current,
        );
      });

      void removeProjectServer(projectId, agentId, mcpServerId)
        .then((nextAssignment) => {
          runPreservingScroll(scrollRootRef.current, () => {
            setDetail((current) =>
              current
                ? {
                    ...current,
                    agentAssignments: (current.agentAssignments ?? []).map((entry) =>
                      entry.agentId === agentId ? { ...entry, assignment: nextAssignment } : entry,
                    ),
                  }
                : current,
            );
          });
          setCommittedOverridesByAgent((current) => ({
            ...current,
            [agentId]: parseProjectConfigOverrides(nextAssignment.configOverrides),
          }));
          if (removedServerKey) {
            setDraftOverridesByAgent((current) => ({
              ...current,
              [agentId]: stripServerOverrideKeys(current[agentId] ?? {}, removedServerKey),
            }));
          }
          if (removedEntry && removedEntry.server.id > 0) {
            replaceMcpToolEnabledMap(removedEntry.server.id, {});
          }
        })
        .catch((cause) => {
          console.error("Failed to remove server from project", cause);
          void syncDetail({ silent: true });
        });
    },
    [detail, projectId, syncDetail],
  );

  const availableAgents = useMemo(() => {
    const linked = new Set(agents.map((agent) => agent.id));
    return allAgents.filter((agent) => !linked.has(agent.id));
  }, [agents, allAgents]);

  const {
    containerRef,
    headerRef,
    setAgentRowRef,
    setAgentRightRef,
    setPresetRef,
    setAddAgentRef,
    scheduleRemeasure,
    rail: agentRail,
  } = useProjectAgentTree({
    agentRowCount: agents.length,
    showAddAgentRow: true,
    enabled: Boolean(detail && !loading),
    railLeft: PANE_ROW_PADDING,
  });

  useEffect(() => {
    resetScrollContainer(scrollRootRef.current);
    agentSectionRefs.current.clear();
    setAddServerAgentId(null);
    const session = readProjectDetailUiSession(projectId);
    setExpandedServerKeys(new Set(session.expandedServerKeys ?? []));
    setAddAgentExpanded(session.addAgentExpanded ?? false);
  }, [projectId]);

  const handleServerExpandedChange = useCallback((cardKey: string, expanded: boolean) => {
    setExpandedServerKeys((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(cardKey);
      } else {
        next.delete(cardKey);
      }
      return next;
    });
  }, []);

  const persistUiSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistUiSessionTimerRef.current) {
      clearTimeout(persistUiSessionTimerRef.current);
    }
    persistUiSessionTimerRef.current = setTimeout(() => {
      persistUiSessionTimerRef.current = null;
      writeProjectDetailUiSession(projectId, {
        expandedServerKeys: [...expandedServerKeys],
        addAgentExpanded,
        scrollTop: scrollRootRef.current?.scrollTop ?? 0,
      });
    }, 300);
    return () => {
      if (persistUiSessionTimerRef.current) {
        clearTimeout(persistUiSessionTimerRef.current);
      }
    };
  }, [addAgentExpanded, expandedServerKeys, projectId]);

  useEffect(() => {
    if (loading || !detail || scrollRestoredRef.current) {
      return;
    }
    const session = readProjectDetailUiSession(projectId);
    if (session.scrollTop != null && scrollRootRef.current) {
      scrollRootRef.current.scrollTop = session.scrollTop;
    }
    scrollRestoredRef.current = true;
  }, [detail, loading, projectId]);

  const handleContentLayoutChange = useCallback(() => {
    scheduleRemeasure();
    remeasureNavigation();
    clampScroll();
  }, [clampScroll, remeasureNavigation, scheduleRemeasure]);

  useEffect(() => {
    handleContentLayoutChange();
  }, [
    addAgentExpanded,
    addServerAgentId,
    agents.length,
    detail?.project.id,
    handleContentLayoutChange,
    loading,
    projectId,
  ]);

  const handleImportPreset = useCallback(
    async (agentId: number, sourcePresetId: string) => {
      const assignment = detail ? getAgentAssignment(detail, agentId) : null;
      if (!assignment) {
        return;
      }
      const source = savedPresets.find((preset) => preset.id === sourcePresetId);
      if (!source) {
        return;
      }

      setCommittedOverridesByAgent((current) => ({ ...current, [agentId]: {} }));
      setDraftOverridesByAgent((current) => ({ ...current, [agentId]: {} }));
      setToolsHistoryToken((value) => value + 1);

      try {
        await updatePresetRecord(String(assignment.presetId), {
          mcpServerIds: [...source.mcpServerIds],
        });
        await updateProjectAssignmentOverrides(projectId, agentId, "{}");
        notifyPresetsChanged();
        emitProjectsChanged();
        void syncDetail({ silent: true, preserveHistory: true });
      } catch (cause) {
        console.error("Failed to import preset", cause);
        void syncDetail({ silent: true, preserveHistory: true });
      }
    },
    [detail, emitProjectsChanged, projectId, savedPresets, syncDetail],
  );

  const getAgentDraftHandler = useCallback(
    (agentId: number) => {
      let handler = agentOverrideHandlersRef.current.get(agentId);
      if (!handler) {
        handler = (serverKey, patch) => {
          handleDraftOverrideChange(agentId, serverKey, patch);
        };
        agentOverrideHandlersRef.current.set(agentId, handler);
      }
      return handler;
    },
    [handleDraftOverrideChange],
  );

  const getAgentSaveHandler = useCallback(
    (agentId: number) => (serverKey: string, patch: ProjectServerOverridePatch) => {
      handleSaveToProject(agentId, serverKey, patch);
    },
    [handleSaveToProject],
  );

  const getAgentResetHandler = useCallback(
    (agentId: number) => (serverKey: string) => {
      pushBeforeSettingChangeRef.current();
      setDraftOverridesByAgent((current) => ({
        ...current,
        [agentId]: { ...(current[agentId] ?? {}), [serverKey]: {} },
      }));
      setToolsHistoryToken((value) => value + 1);
    },
    [],
  );

  useEffect(() => {
    agentOverrideHandlersRef.current.clear();
  }, [projectId]);

  const handleSavePresetAs = useCallback(
    async (agentId: number, name: string) => {
      const assignment = detail ? getAgentAssignment(detail, agentId) : null;
      if (!assignment) {
        return;
      }
      const oldPresetId = assignment.presetId;
      const serverIds = assignment.servers.map((entry) => entry.server.id);
      try {
        const created = await createPresetRecord({ name });
        await updatePresetRecord(created.id, { mcpServerIds: serverIds });
        const linked = await assignProjectPreset(projectId, agentId, created.id);
        if (!linked) {
          console.error("Failed to assign saved preset to agent");
          return;
        }
        const result = await tryDeletePresetRecord(String(oldPresetId));
        if (result.deleted) {
          notifyPresetsChanged();
        }
        emitProjectsChanged();
        void syncDetail({ silent: true, preserveHistory: true });
      } catch (cause) {
        console.error("Failed to save preset as", cause);
      }
    },
    [detail, emitProjectsChanged, projectId, syncDetail],
  );

  const applyAssignmentToAgent = useCallback(
    (agentId: number, assignment: NonNullable<ReturnType<typeof getAgentAssignment>>) => {
      runPreservingScroll(scrollRootRef.current, () => {
        setDetail((current) =>
          current
            ? {
                ...current,
                agentAssignments: (current.agentAssignments ?? []).map((entry) =>
                  entry.agentId === agentId
                    ? {
                        ...entry,
                        assignment,
                        hasCustomPreset:
                          current.defaultAssignment != null &&
                          assignment.presetId !== current.defaultAssignment.presetId,
                      }
                    : entry,
                ),
              }
            : current,
        );
      });
      setCommittedOverridesByAgent((current) => ({
        ...current,
        [agentId]: parseProjectConfigOverrides(assignment.configOverrides),
      }));
      setDraftOverridesByAgent((current) => ({
        ...current,
        [agentId]: {},
      }));
      setToolsHistoryToken((value) => value + 1);
    },
    [],
  );

  const handleDeleteCustomPreset = useCallback(
    async (agentId: number) => {
      try {
        const assignment = await deleteProjectCustomPreset(projectId, agentId);
        if (!assignment) {
          return;
        }
        applyAssignmentToAgent(agentId, assignment);
        emitProjectsChanged();
      } catch (cause) {
        console.error("Failed to delete custom preset", cause);
        void syncDetail({ silent: true, preserveHistory: true });
      }
    },
    [applyAssignmentToAgent, emitProjectsChanged, projectId, syncDetail],
  );

  const handleResetAgent = useCallback(
    async (agentId: number) => {
      runPreservingScroll(scrollRootRef.current, () => {
        setDetail((current) =>
          current
            ? {
                ...current,
                agents: current.agents.filter((agent) => agent.id !== agentId),
                agentAssignments: (current.agentAssignments ?? []).filter(
                  (entry) => entry.agentId !== agentId,
                ),
              }
            : current,
        );
      });
      setCommittedOverridesByAgent((current) => {
        const next = { ...current };
        delete next[agentId];
        return next;
      });
      setDraftOverridesByAgent((current) => {
        const next = { ...current };
        delete next[agentId];
        return next;
      });

      try {
        const reset = await resetProjectAgent(projectId, agentId);
        if (reset) {
          emitProjectsChanged();
        } else {
          void syncDetail({ silent: true });
        }
      } catch (cause) {
        console.error("Failed to reset agent", cause);
        void syncDetail({ silent: true, preserveHistory: true });
      }
    },
    [emitProjectsChanged, projectId, syncDetail],
  );

  const handleUseDefaultPreset = useCallback(
    async (agentId: number) => {
      try {
        const assignment = await useProjectDefaultPreset(projectId, agentId);
        if (!assignment) {
          return;
        }
        applyAssignmentToAgent(agentId, assignment);
        emitProjectsChanged();
      } catch (cause) {
        console.error("Failed to switch to default preset", cause);
        void syncDetail({ silent: true, preserveHistory: true });
      }
    },
    [applyAssignmentToAgent, emitProjectsChanged, projectId, syncDetail],
  );

  const handleUseCustomPreset = useCallback(
    async (agentId: number) => {
      try {
        const assignment = await useProjectCustomPreset(projectId, agentId);
        if (!assignment) {
          return;
        }
        applyAssignmentToAgent(agentId, assignment);
        emitProjectsChanged();
      } catch (cause) {
        console.error("Failed to switch to custom preset", cause);
        void syncDetail({ silent: true, preserveHistory: true });
      }
    },
    [applyAssignmentToAgent, emitProjectsChanged, projectId, syncDetail],
  );

  const handleLinkAgent = useCallback(
    (agentId: number) => {
      const agent = allAgents.find((entry) => entry.id === agentId);
      if (!agent) {
        return;
      }

      setAddAgentExpanded(false);
      runPreservingScroll(scrollRootRef.current, () => {
        setDetail((current) => {
          if (!current) {
            return current;
          }
          const defaultAssignment = current.defaultAssignment;
          const optimisticAssignment = defaultAssignment
            ? {
                presetId: -(agentId + 1),
                presetName: `${current.project.name}-${agent.name}`,
                configOverrides: defaultAssignment.configOverrides,
                servers: defaultAssignment.servers.map((entry) => ({ ...entry })),
              }
            : null;
          return {
            ...current,
            agents: [...current.agents, agent],
            agentAssignments: [
              ...(current.agentAssignments ?? []),
              {
                agentId,
                assignment: optimisticAssignment,
                hasCustomPreset: true,
              },
            ],
          };
        });
      });

      void linkProjectAgent(projectId, agentId)
        .then((linked) => {
          if (linked) {
            emitProjectsChanged();
            void syncDetail({ silent: true, preserveHistory: true });
          } else {
            void syncDetail({ silent: true });
          }
        })
        .catch((cause) => {
          console.error("Failed to link agent to project", cause);
          void syncDetail({ silent: true });
        });
    },
    [allAgents, emitProjectsChanged, projectId, syncDetail],
  );

  const bindAgentSectionRef = useCallback((agentId: number) => (node: HTMLDivElement | null) => {
    if (node) {
      agentSectionRefs.current.set(agentId, node);
    } else {
      agentSectionRefs.current.delete(agentId);
    }
  }, []);

  const renderPresetActions = (agentId: number) => {
    if (!detail) {
      return undefined;
    }
    const assignment = getAgentAssignment(detail, agentId);
    return (
      <ProjectPresetActions
        presetName={
          assignment?.presetName ??
          detail.defaultAssignment?.presetName ??
          detail.project.name
        }
        presetMode={resolveAgentPresetMode(detail, agentId)}
        hasDefaultPreset={detail.defaultAssignment != null}
        hasAssignment={assignment != null}
        defaultSourceMcpJson={detail.defaultSourceMcpJson}
        savedPresets={savedPresets}
        onSaveAs={(name) => handleSavePresetAs(agentId, name)}
        onImport={(presetId) => handleImportPreset(agentId, presetId)}
        onDeleteCustom={() => void handleDeleteCustomPreset(agentId)}
        onResetAgent={() => void handleResetAgent(agentId)}
        onUseDefault={() => void handleUseDefaultPreset(agentId)}
        onUseCustom={() => void handleUseCustomPreset(agentId)}
      />
    );
  };

  if (loading) {
    return (
      <YStack flex={1} justify="center" items="center" px={24}>
        <Text color={colors.muted} fontSize={13} select="none">
          Loading project…
        </Text>
      </YStack>
    );
  }

  if (!detail) {
    return (
      <YStack flex={1} justify="center" items="center" px={24}>
        <Text color={colors.muted} fontSize={13} text="center" select="none">
          Project not found.
        </Text>
      </YStack>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      <div
        ref={scrollRootRef}
        className={mergeLayoutClass(layoutClasses.scrollY, "td-scroll-y-invisible")}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          paddingBottom: 24,
          paddingRight: PROJECT_SERVER_EXPAND_RIGHT,
          overflowX: "visible",
        }}
      >
        <div
          key={projectId}
          ref={containerRef}
          style={{
            position: "relative",
            paddingRight: PANE_ROW_PADDING,
          }}
        >
          <div
            ref={headerRef}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              background: colors.page,
              paddingTop: PROJECT_HEADER_PADDING_TOP,
              paddingBottom: PROJECT_HEADER_PADDING_BOTTOM,
              paddingRight: PANE_ROW_PADDING,
              marginRight: -PANE_ROW_PADDING,
            }}
          >
            <ProjectDetailHeader
              projectName={detail.project.name}
              canUndo={canUndoSettings}
              canRedo={canRedoSettings}
              onUndo={handleUndoSettings}
              onRedo={handleRedoSettings}
            />
          </div>

          <div style={{ height: PROJECT_TREE_HEADER_SPACER, flexShrink: 0 }} aria-hidden />

          {agentRail.branchTargets.length > 0 ? (
            <ProjectGitTreeRail
              branchTargets={agentRail.branchTargets}
              horizontalConnectors={agentRail.horizontalConnectors}
              trunkStartY={agentRail.trunkStartY}
              absolute
              left={PANE_ROW_PADDING}
              top={0}
              width={TREE_RAIL_WIDTH}
              canvasWidth={agentRail.canvasWidth}
            />
          ) : null}

          <div
            style={{
              marginLeft: TREE_CONTENT_INDENT - PANE_ROW_PADDING,
              display: "flex",
              flexDirection: "column",
              gap: AGENT_BRANCH_GAP,
              width: `calc(100% - ${TREE_CONTENT_INDENT - PANE_ROW_PADDING}px)`,
              minWidth: 0,
              position: "relative",
              overflow: "visible",
            }}
          >
            {agents.length === 0 ? (
              <Text color={colors.muted} fontSize={12} py={4} select="none">
                No agents linked yet. Use Add agent below.
              </Text>
            ) : (
              agents.map((agent, index) => {
                const assignment = getAgentAssignment(detail, agent.id);
                const presetName =
                  assignment?.presetName ??
                  detail.defaultAssignment?.presetName ??
                  null;
                const servers = assignment?.servers ?? [];
                const presetMode = assignment ? resolveAgentPresetMode(detail, agent.id) : null;

                return (
                  <div key={agent.id} ref={bindAgentSectionRef(agent.id)}>
                    <ProjectAgentBranch
                      rowRef={setAgentRowRef(index)}
                      agentRightRef={setAgentRightRef(index)}
                      presetRef={setPresetRef(index)}
                      agent={agent}
                      agentId={agent.id}
                      presetName={presetName}
                      presetMode={presetMode}
                      canAddServers={presetMode !== "default"}
                      presetAction={renderPresetActions(agent.id)}
                      servers={servers}
                      installedServers={installedServers}
                      committedOverrides={committedOverridesByAgent[agent.id] ?? {}}
                      draftOverrides={draftOverridesByAgent[agent.id] ?? {}}
                      onDraftOverrideChange={getAgentDraftHandler(agent.id)}
                      onSaveToProject={getAgentSaveHandler(agent.id)}
                      onResetDraft={getAgentResetHandler(agent.id)}
                      toolsHistoryToken={toolsHistoryToken}
                      expandedServerKeys={expandedServerKeys}
                      onServerExpandedChange={handleServerExpandedChange}
                      addServerExpanded={addServerAgentId === agent.id}
                      onOpenAddServer={() => setAddServerAgentId(agent.id)}
                      onCollapseAddServer={() => setAddServerAgentId(null)}
                      onAddServer={(mcpServerId) => void handleAddServer(agent.id, mcpServerId)}
                      onRemoveServer={(mcpServerId) =>
                        void handleRemoveServer(agent.id, mcpServerId)
                      }
                      enabled={!loading}
                    />
                  </div>
                );
              })
            )}

            <ProjectAddAgentRow
              rowRef={setAddAgentRef}
              onClick={() => setAddAgentExpanded((current) => !current)}
            />

            {addAgentExpanded ? (
              <ProjectAgentPicker agents={availableAgents} onPick={handleLinkAgent} />
            ) : null}
          </div>
        </div>
      </div>

      {agentIds.length > 0 ? (
        <aside
          style={{
            width: NAV_PANEL_WIDTH,
            flexShrink: 0,
            minHeight: 0,
            alignSelf: "stretch",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            justifyContent: "flex-start",
            paddingTop: 12,
            boxSizing: "border-box",
          }}
        >
          <ProjectNavigationPanel
            agents={agents}
            navigation={navigation}
            onSelectAgent={selectAgent}
          />
        </aside>
      ) : null}
    </div>
  );
}
