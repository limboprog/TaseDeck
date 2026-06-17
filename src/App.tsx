import { useEffect, useState } from "react";
import { loadAgentCatalog, loadMcpTransportCatalog } from "./services/catalog";
import { TamaguiProvider } from "tamagui";
import { YStack } from "tamagui";
import { AppShell } from "./components/AppShell/AppShell";
import type { NavId } from "./components/Sidebar/Sidebar";
import { AgentsPage } from "./features/agents/AgentsPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { McpInstalledPage } from "./features/mcp/McpInstalledPage";
import { McpRegistryPage } from "./features/mcp/McpRegistryPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { UsagePage } from "./features/usage/UsagePage";
import { WorkspacePage } from "./features/workspace/WorkspacePage";
import { SurfaceModeProvider } from "./preferences/SurfaceModeContext";
import { ThemeProvider, useThemeMode } from "./preferences/ThemeContext";
import { layoutClasses, mergeLayoutClass } from "./styles/layout";
import { APP_NAVIGATE_EVENT } from "./navigation/appNavigation";
import { colors } from "./theme";
import config from "./tamagui.config";

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
  onNavigate,
}: {
  activeId: NavId;
  onNavigate: (id: NavId) => void;
}) {
  return (
    <>
      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "market")}>
        <McpRegistryPage marketActive={activeId === "market"} />
      </YStack>

      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "agents")}>
        <AgentsPage />
      </YStack>

      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "mcp")}>
        <McpInstalledPage mcpActive={activeId === "mcp"} />
      </YStack>

      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "workspace")}>
        <WorkspacePage workspaceActive={activeId === "workspace"} />
      </YStack>

      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "profile")}>
        <ProfilePage />
      </YStack>

      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "dashboard")}>
        <DashboardPage
          dashboardActive={activeId === "dashboard"}
          onNavigate={onNavigate}
        />
      </YStack>

      <YStack className={layoutClasses.clip} style={sectionPanelStyle(activeId, "usage")}>
        <UsagePage usageActive={activeId === "usage"} />
      </YStack>
    </>
  );
}

function AppContent() {
  const [activeId, setActiveId] = useState<NavId>("dashboard");
  const { colorScheme } = useThemeMode();

  useEffect(() => {
    void loadAgentCatalog();
    void loadMcpTransportCatalog();
  }, []);

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ navId: NavId }>).detail;
      if (detail?.navId) {
        setActiveId(detail.navId);
      }
    };
    window.addEventListener(APP_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(APP_NAVIGATE_EVENT, onNavigate);
  }, []);

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
        >
          <AppShell activeId={activeId} onNavigate={setActiveId}>
            <SectionContent activeId={activeId} onNavigate={setActiveId} />
          </AppShell>
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
