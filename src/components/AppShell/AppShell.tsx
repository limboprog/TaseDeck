import { useState, type ReactNode } from "react";
import { XStack, YStack } from "tamagui";
import { useSurfaceMode } from "../../preferences/SurfaceModeContext";
import { blocks, borders, colors, glassGlowStyle, glassSurfaceStyle, shellSurfaceStyle } from "../../theme";
import { Sidebar, type NavId } from "../Sidebar/Sidebar";

type AppShellProps = {
  activeId: NavId;
  onNavigate: (id: NavId) => void;
  children: ReactNode;
};

export function AppShell({ activeId, onNavigate, children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { liquidGlass } = useSurfaceMode();

  const shellBorder = liquidGlass ? colors.glassBorder : borders.default;
  const shellStyle = liquidGlass ? glassSurfaceStyle : shellSurfaceStyle;

  return (
    <XStack
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
        onNavigate={onNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />

      <YStack flex={1} minW={0} minH={0} overflow="hidden">
        <YStack
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
            <YStack
              fullscreen
              rounded={blocks.shellContent.borderRadius}
              pointerEvents="none"
              style={glassGlowStyle}
            />
          ) : null}

          <YStack flex={1} minH={0} py={24} px={28} z={1} overflow="hidden">
            <YStack flex={1} minH={0} overflow="hidden">
              {children}
            </YStack>
          </YStack>
        </YStack>
      </YStack>
    </XStack>
  );
}
