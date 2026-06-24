import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  BsLayoutSidebar,
  GoPerson,
  IoCubeOutline,
  PiHouse,
  LuChartNoAxesColumnIncreasing,
  PiStackLight,
  VscSettings,
} from "../../icons";
import { Button, Text, XStack, YStack } from "tamagui";
import { DASHBOARD_ENABLED, PRESETS_ENABLED } from "../../navigation/featureFlags";
import { openGraphContextMenu } from "../../features/workspace/showNativeContextMenu";
import {
  defaultProjectsPageSession,
  PROJECTS_PAGE_SESSION_KEY,
  readPageSession,
  writePageSession,
} from "../../session/appSession";
import {
  createProjectRecord,
  folderBaseName,
  listProjectRecords,
  pickProjectDirectory,
  PROJECTS_CHANGED_EVENT,
  type Project,
} from "../../services/projects";
import { colors, tamaguiSurfaces } from "../../theme";
import { SidebarAgentAddButton } from "./SidebarAgentAddButton";
import { SidebarNavGroup } from "./SidebarNavGroup";
import { SidebarNavSubItem } from "./SidebarNavSubItem";
import {
  SIDEBAR_NAV_ITEM_GAP,
  SIDEBAR_NAV_ITEM_PY,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
  collapseToggleTranslateX,
  iconButtonPadLeft,
  sidebarPadX,
} from "./sidebarStyles";

export type NavId =
  | "dashboard"
  | "presets"
  | "usage"
  | "projects"
  | "mcp"
  | "profile";

type NavItem = {
  id: NavId;
  label: string;
  icon: ReactNode;
};

const mainNavItems: NavItem[] = [
  ...(DASHBOARD_ENABLED
    ? [{ id: "dashboard" as const, label: "Dashboard", icon: <PiHouse size={18} /> }]
    : []),
  ...(PRESETS_ENABLED
    ? [{ id: "presets" as const, label: "Presets", icon: <VscSettings size={18} /> }]
    : []),
  { id: "usage", label: "Usage", icon: <LuChartNoAxesColumnIncreasing size={18} /> },
  { id: "mcp", label: "MCP", icon: <PiStackLight size={18} /> },
];

const profileItem: NavItem = {
  id: "profile",
  label: "Profile",
  icon: <GoPerson size={18} />,
};

type SidebarProps = {
  activeId: NavId;
  selectedProjectId: string | null;
  onNavigate: (id: NavId) => void;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function NavButton({
  item,
  activeId,
  onNavigate,
  collapsed,
}: {
  item: NavItem;
  activeId: NavId;
  onNavigate: (id: NavId) => void;
  collapsed: boolean;
}) {
  const isActive = activeId === item.id;
  const tone = isActive ? colors.foreground : colors.muted;

  return (
    <Button
      unstyled
      width="100%"
      py={SIDEBAR_NAV_ITEM_PY}
      pl={iconButtonPadLeft(collapsed)}
      pr={collapsed ? iconButtonPadLeft(collapsed) : 10}
      rounded={8}
      bg={isActive ? tamaguiSurfaces.controlHoverBg : "transparent"}
      hoverStyle={{
        bg: tamaguiSurfaces.controlBg,
      }}
      pressStyle={{
        bg: tamaguiSurfaces.controlHoverBg,
      }}
      onPress={() => onNavigate(item.id)}
      aria-current={isActive ? "page" : undefined}
      aria-label={item.label}
    >
      <XStack width="100%" items="center" justify="flex-start" gap={collapsed ? 0 : 10}>
        <XStack width={18} shrink={0} items="center" justify="center" style={{ color: tone }}>
          {item.icon}
        </XStack>
        <Text
          color={tone}
          fontSize={15}
          fontWeight="400"
          text="left"
          flex={1}
          overflow="hidden"
          whiteSpace="nowrap"
          opacity={collapsed ? 0 : 1}
          maxW={collapsed ? 0 : 160}
          pointerEvents={collapsed ? "none" : "auto"}
          hoverStyle={{ color: colors.foreground }}
          style={{
            transition: "opacity 0.15s ease, max-width 0.2s ease",
          }}
        >
          {item.label}
        </Text>
      </XStack>
    </Button>
  );
}

function ProjectsNavGroup({
  activeId,
  selectedProjectId,
  collapsed,
  onSelectProject,
  onDeleteProject,
}: {
  activeId: NavId;
  selectedProjectId: string | null;
  collapsed: boolean;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState(
    () =>
      readPageSession(PROJECTS_PAGE_SESSION_KEY, defaultProjectsPageSession()).projectsNavExpanded ??
      true,
  );

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await listProjectRecords());
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    const onChanged = () => {
      void loadProjects();
    };
    window.addEventListener(PROJECTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, onChanged);
  }, [loadProjects]);

  useEffect(() => {
    if (activeId === "projects" && selectedProjectId != null) {
      setExpanded(true);
    }
  }, [activeId, selectedProjectId]);

  const handleExpandedChange = (next: boolean) => {
    setExpanded(next);
    const session = readPageSession(PROJECTS_PAGE_SESSION_KEY, defaultProjectsPageSession());
    writePageSession(PROJECTS_PAGE_SESSION_KEY, { ...session, projectsNavExpanded: next });
  };

  const handleAddProject = async () => {
    const picked = (await pickProjectDirectory())?.trim() ?? "";
    if (!picked) {
      return;
    }
    const created = await createProjectRecord({
      name: folderBaseName(picked),
      folderPath: picked,
    });
    onSelectProject(created.id);
  };

  return (
    <SidebarNavGroup
      title="Projects"
      expanded={expanded}
      onExpandedChange={handleExpandedChange}
      collapsed={collapsed}
    >
      {projects.map((project) => (
        <SidebarNavSubItem
          key={project.id}
          label={project.name}
          leading={<IoCubeOutline size={18} color={project.iconColor} />}
          trailing={
            project.diskSyncPending ? (
              <span
                title="Disk sync pending"
                aria-label="Disk sync pending"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: colors.warning,
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
            ) : null
          }
          active={activeId === "projects" && selectedProjectId === project.id}
          collapsed={collapsed}
          onPress={() => onSelectProject(project.id)}
          onContextMenu={(event) => {
            openGraphContextMenu(event, [
              {
                id: "delete",
                label: "Delete",
                onSelect: () => onDeleteProject(project.id),
              },
            ]);
          }}
        />
      ))}
      <SidebarAgentAddButton collapsed={collapsed} onPress={() => void handleAddProject()} />
    </SidebarNavGroup>
  );
}

export function Sidebar({
  activeId,
  selectedProjectId,
  onNavigate,
  onSelectProject,
  onDeleteProject,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const padX = sidebarPadX(collapsed);

  return (
    <YStack
      shrink={0}
      pt={12}
      pb={16}
      justify="space-between"
      height="100%"
      items="stretch"
      aria-label="Navigation"
      style={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
        paddingLeft: padX,
        paddingRight: padX,
        transition: "width 0.2s ease, padding 0.2s ease",
      }}
    >
      <YStack gap={8} width="100%" items="stretch">
        <XStack width="100%" position="relative" pb={4} style={{ height: 22 }}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              position: "absolute",
              top: 0,
              left: iconButtonPadLeft(collapsed),
              transform: `translateX(${collapseToggleTranslateX(collapsed)}px)`,
              transition: "transform 0.2s ease, left 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              border: "none",
              background: "transparent",
              color: colors.muted,
              cursor: "pointer",
              padding: 0,
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = colors.foreground;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = colors.muted;
            }}
          >
            <BsLayoutSidebar size={18} />
          </button>
        </XStack>

        <YStack gap={SIDEBAR_NAV_ITEM_GAP} width="100%" items="stretch">
          {mainNavItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              activeId={activeId}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          ))}

          <ProjectsNavGroup
            activeId={activeId}
            selectedProjectId={selectedProjectId}
            collapsed={collapsed}
            onSelectProject={onSelectProject}
            onDeleteProject={onDeleteProject}
          />
        </YStack>
      </YStack>

      <YStack pt={16} width="100%" items="stretch">
        <NavButton
          item={profileItem}
          activeId={activeId}
          onNavigate={onNavigate}
          collapsed={collapsed}
        />
      </YStack>
    </YStack>
  );
}
