import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { loadAgentCatalog, loadMcpTransportCatalog } from "./services/catalog";
import { TamaguiProvider } from "tamagui";
import { YStack } from "tamagui";
import { AppShell } from "./components/AppShell/AppShell";
import type { NavId } from "./components/Sidebar/Sidebar";
import { McpPage } from "./features/mcp/McpPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { UsagePage } from "./features/usage/UsagePage";
import { PresetsPage } from "./features/presets/PresetsPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { SurfaceModeProvider } from "./preferences/SurfaceModeContext";
import { ThemeProvider, useThemeMode } from "./preferences/ThemeContext";
import { layoutClasses, mergeLayoutClass } from "./styles/layout";
import { APP_NAVIGATE_EVENT } from "./navigation/appNavigation";
import { PRESETS_ENABLED, DEFAULT_NAV_ID, DASHBOARD_ENABLED, resolveNavId } from "./navigation/featureFlags";
import { notifyAgentsChanged } from "./services/agents/recordsApi";
import { finalizeDiscoveredAgents } from "./services/agents/finalizeDiscoveredAgents";
import {
  clearStoredProjects,
  getStoredProjects,
  deleteProjectRecord,
} from "./services/projects";
import { clearStoredPresets, getStoredPresets, notifyPresetsChanged } from "./services/presets/storage";
import { runWorkspaceBootstrap, getWorkspaceBootstrapStatus } from "./services/workspace/bootstrapApi";
import { WorkspaceBootstrapOverlay } from "./features/onboarding/WorkspaceBootstrapOverlay";
import {
  defaultProjectsPageSession,
  PROJECTS_PAGE_SESSION_KEY,
  readPageSession,
  writePageSession,
} from "./session/appSession";
import { colors } from "./theme";
import config from "./tamagui.config";

const DashboardPage = DASHBOARD_ENABLED
  ? lazy(() =>
      import("./features/dashboard/DashboardPage").then((module) => ({
        default: module.DashboardPage,
      })),
    )
  : null;

function sectionPanelStyle(activeId: NavId, id: NavId) {
  const visible = activeId === id;
  return {
    display: visible ? "flex" : "none",
    flex: 1,
    flexDirection: "column" as const,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  };
}

function SectionContent({
  activeId,
  selectedProjectId,
  onNavigate,
}: {
  activeId: NavId;
  selectedProjectId: string | null;
  onNavigate: (id: NavId) => void;
}) {
  return (
    <>
      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "mcp")}>
        <McpPage mcpActive={activeId === "mcp"} />
      </YStack>

      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "projects")}>
        <ProjectsPage selectedProjectId={selectedProjectId} />
      </YStack>

      {PRESETS_ENABLED ? (
        <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "presets")}>
          <PresetsPage presetsActive={activeId === "presets"} />
        </YStack>
      ) : null}

      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "profile")}>
        <ProfilePage />
      </YStack>

      {DASHBOARD_ENABLED && DashboardPage ? (
        <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "dashboard")}>
          <Suspense fallback={null}>
            <DashboardPage
              dashboardActive={activeId === "dashboard"}
              onNavigate={onNavigate}
            />
          </Suspense>
        </YStack>
      ) : null}

      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "usage")}>
        <UsagePage usageActive={activeId === "usage"} />
      </YStack>
    </>
  );
}

function AppContent() {
  const [activeId, setActiveId] = useState<NavId>(DEFAULT_NAV_ID);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    const session = readPageSession(PROJECTS_PAGE_SESSION_KEY, defaultProjectsPageSession());
    return session.selectedProjectId ?? null;
  });
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState("Scanning agents and projects…");
  const { colorScheme } = useThemeMode();

  useEffect(() => {
    void loadAgentCatalog();
    void loadMcpTransportCatalog();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const status = await getWorkspaceBootstrapStatus();
        if (status.completed || cancelled) {
          return;
        }

        setBootstrapping(true);
        setBootstrapMessage("Scanning installed agents…");

        const legacyProjects = getStoredProjects().map((project) => ({
          name: project.name,
          folderPath: project.folderPath,
          iconColor: project.iconColor,
        }));
        const legacyPresets = getStoredPresets().map((preset) => ({
          name: preset.name,
          mcpServerIds: preset.mcpServerIds,
        }));

        const result = await runWorkspaceBootstrap({ legacyProjects, legacyPresets });

        if (cancelled) {
          return;
        }

        if (legacyProjects.length > 0) {
          clearStoredProjects();
        }
        if (legacyPresets.length > 0) {
          clearStoredPresets();
        }

        setBootstrapMessage("Applying agent defaults…");
        await finalizeDiscoveredAgents(result.agentIds);

        setBootstrapMessage(
          result.skipped
            ? "Workspace is ready."
            : `Found ${result.agentsDiscovered} agents, ${result.projectsUpserted} projects, ${result.presetsCreated} presets.`,
        );

        notifyAgentsChanged();
        window.dispatchEvent(new CustomEvent("projects-changed"));
        window.dispatchEvent(new CustomEvent("presets-changed"));
      } catch (cause) {
        console.error("Workspace bootstrap failed", cause);
        if (!cancelled) {
          setBootstrapMessage("Workspace scan failed. You can continue manually.");
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const session = readPageSession(PROJECTS_PAGE_SESSION_KEY, defaultProjectsPageSession());
    writePageSession(PROJECTS_PAGE_SESSION_KEY, { ...session, selectedProjectId });
  }, [selectedProjectId]);

  const handleNavigate = useCallback((id: NavId) => {
    setActiveId(resolveNavId(id));
    if (id !== "projects") {
      setSelectedProjectId(null);
    }
  }, []);

  const handleSelectProject = useCallback((projectId: string) => {
    setActiveId("projects");
    setSelectedProjectId(projectId);
  }, []);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
      }
      try {
        await deleteProjectRecord(projectId);
        notifyPresetsChanged();
      } catch (cause) {
        console.error("Failed to delete project", cause);
      }
    },
    [selectedProjectId],
  );

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ navId: NavId }>).detail;
      if (detail?.navId) {
        handleNavigate(resolveNavId(detail.navId));
      }
    };
    window.addEventListener(APP_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(APP_NAVIGATE_EVENT, onNavigate);
  }, [handleNavigate]);

  return (
    <TamaguiProvider config={config} defaultTheme={colorScheme} key={colorScheme}>
      <SurfaceModeProvider>
        <YStack
          className={mergeLayoutClass(layoutClasses.clip, layoutClasses.stack)}
          flex={1}
          height="100%"
          minH={0}
          minW={0}
          overflow="hidden"
          bg={colors.background}
          position="relative"
        >
          <AppShell
            activeId={activeId}
            selectedProjectId={selectedProjectId}
            onNavigate={handleNavigate}
            onSelectProject={handleSelectProject}
            onDeleteProject={handleDeleteProject}
          >
            <SectionContent
              activeId={activeId}
              selectedProjectId={selectedProjectId}
              onNavigate={handleNavigate}
            />
          </AppShell>
          {bootstrapping ? <WorkspaceBootstrapOverlay message={bootstrapMessage} /> : null}
        </YStack>
      </SurfaceModeProvider>
    </TamaguiProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
