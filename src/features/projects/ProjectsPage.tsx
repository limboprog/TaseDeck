import { Text, YStack } from "tamagui";
import { pageContentInsets } from "../../styles/layout";
import { colors } from "../../theme";
import { ProjectDetailView } from "./ProjectDetailView";

type ProjectsPageProps = {
  selectedProjectId: string | null;
};

export function ProjectsPage({ selectedProjectId }: ProjectsPageProps) {
  return (
    <YStack flex={1} minH={0} minW={0} overflow="hidden" {...pageContentInsets}>
      {selectedProjectId ? (
        <ProjectDetailView projectId={selectedProjectId} />
      ) : (
        <YStack flex={1} justify="center" items="center" px={24}>
          <Text color={colors.muted} fontSize={14} text="center" lineHeight={22} select="none">
            Select a project from the sidebar, or click + to add a folder.
          </Text>
        </YStack>
      )}
    </YStack>
  );
}
