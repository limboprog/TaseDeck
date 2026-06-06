import { useState } from "react";
import { TamaguiProvider } from "tamagui";
import { Text, YStack } from "tamagui";
import { AppShell } from "./components/AppShell/AppShell";
import type { NavId } from "./components/Sidebar/Sidebar";
import { AgentsPage } from "./features/agents/AgentsPage";
import { McpInstalledPage } from "./features/mcp/McpInstalledPage";
import { McpRegistryPage } from "./features/mcp/McpRegistryPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { UsagePage } from "./features/usage/UsagePage";
import { WorkspacePage } from "./features/workspace/WorkspacePage";
import { SurfaceModeProvider } from "./preferences/SurfaceModeContext";
import { ThemeProvider, useThemeMode } from "./preferences/ThemeContext";
import { colors } from "./theme";
import config from "./tamagui.config";

const sectionHints: Record<NavId, string> = {
  dashboard: "Обзор активности и метрик.",
  workspace: "Рабочая зона агентов и сценариев.",
  usage: "История вызовов MCP tools.",
  agents: "Агенты и глобальные конфиги MCP.",
  mcp: "Установленные MCP-серверы.",
  market: "Каталог MCP-серверов и интеграций.",
  profile: "Аккаунт и настройки.",
};

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

function SectionContent({ activeId }: { activeId: NavId }) {
  return (
    <>
      <YStack style={sectionPanelStyle(activeId, "market")}>
        <McpRegistryPage />
      </YStack>

      <YStack style={sectionPanelStyle(activeId, "agents")}>
        <AgentsPage />
      </YStack>

      <YStack style={sectionPanelStyle(activeId, "mcp")}>
        <McpInstalledPage />
      </YStack>

      <YStack style={sectionPanelStyle(activeId, "workspace")}>
        <WorkspacePage workspaceActive={activeId === "workspace"} />
      </YStack>

      <YStack style={sectionPanelStyle(activeId, "profile")}>
        <ProfilePage />
      </YStack>

      <YStack
        style={{
          ...sectionPanelStyle(activeId, "dashboard"),
          justifyContent: "flex-start",
          padding: 16,
        }}
      >
        <Text color={colors.muted} fontSize={14}>
          {sectionHints.dashboard}
        </Text>
      </YStack>

      <YStack style={sectionPanelStyle(activeId, "usage")}>
        <UsagePage usageActive={activeId === "usage"} />
      </YStack>
    </>
  );
}

function AppContent() {
  const [activeId, setActiveId] = useState<NavId>("dashboard");
  const { colorScheme } = useThemeMode();

  return (
    <TamaguiProvider config={config} defaultTheme={colorScheme} key={colorScheme}>
      <SurfaceModeProvider>
        <YStack flex={1} height="100%" minH={0} minW={0} overflow="hidden" bg={colors.background}>
          <AppShell activeId={activeId} onNavigate={setActiveId}>
            <SectionContent activeId={activeId} />
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
