import { useState, type ReactNode } from "react";
import { XStack, YStack } from "tamagui";
import { useSurfaceMode } from "../../preferences/SurfaceModeContext";
import { layoutClasses, mergeLayoutClass } from "../../styles/layout";
import { blocks, borders, colors, glassGlowStyle, glassSurfaceStyle, shellSurfaceStyle } from "../../theme";
import { Sidebar, type NavId } from "../Sidebar/Sidebar";

type AppShellProps = {
  activeId: NavId;
  selectedProjectId: string | null;
  onNavigate: (id: NavId) => void;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  children: ReactNode;
};

export function AppShell({
  activeId,
  selectedProjectId,
  onNavigate,
  onSelectProject,
  onDeleteProject,
  children,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { liquidGlass } = useSurfaceMode();

  const shellBorder = liquidGlass ? colors.glassBorder : borders.default;
  const shellStyle = liquidGlass ? glassSurfaceStyle : shellSurfaceStyle;

  return (
    <XStack
      className={mergeLayoutClass(layoutClasses.clip, layoutClasses.stack)}
      flex={1}
      height="100%"
      minH={0}
      minW={0}
      overflow="hidden"
      bg={colors.background}
      pt={10}
      pr={12}
      pb={12}
      pl={4}
      gap={4}
    >
      <Sidebar
        activeId={activeId}
        selectedProjectId={selectedProjectId}
        onNavigate={onNavigate}
        onSelectProject={onSelectProject}
        onDeleteProject={onDeleteProject}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />

      <YStack className={layoutClasses.clip} flex={1} minW={0} minH={0} overflow="hidden">
        <YStack
          className={layoutClasses.clip}
          flex={1}
          minH={0}
          position="relative"
          rounded={blocks.shellContent.borderRadius}
          overflow="hidden"
          borderWidth={1}
          borderColor={shellBorder}
          style={shellStyle}
          role="region"
          aria-label="Application"
        >
          {liquidGlass ? (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                ...glassGlowStyle,
              }}
            />
          ) : null}
          {children}
        </YStack>
      </YStack>
    </XStack>
  );
}
