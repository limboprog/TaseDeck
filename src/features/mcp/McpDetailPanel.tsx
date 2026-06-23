import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Text, YStack } from "tamagui";
import type { McpServerEntry } from "../../services/mcp_registry";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import { colors } from "../../theme";
import { InstalledMcpCard, type InstalledMcpDetailActions } from "./InstalledMcpCard";
import { McpServerDetailContent } from "./McpServerDetailPage";
import { McpDetailHeader } from "./McpDetailHeader";
import { InstalledMcpDocsSection } from "./McpServerDocsSection";
import { scrollElementToTopWithinContainer } from "./detailPanelScroll";
import {
  getInstalledServerTitle,
  getRegistryServerTitle,
} from "./mcpServerSummary";

type McpDetailPanelProps = {
  selectionToken: string | null;
  entry: McpServerEntry | null;
  installedServer: InstalledMcpServer | null;
  onUpdated: () => void;
  onDeleted?: (serverId: number) => void;
  onInstalled?: (server: InstalledMcpServer) => void;
  docsExpanded?: boolean;
  onDocsExpandedChange?: (expanded: boolean) => void;
  docsScrollSignal?: number;
  detailScrollResetSignal?: number;
};

export function McpDetailPanel({
  selectionToken,
  entry,
  installedServer,
  onUpdated,
  onDeleted,
  onInstalled,
  docsExpanded: docsExpandedProp,
  onDocsExpandedChange,
  docsScrollSignal = 0,
  detailScrollResetSignal = 0,
}: McpDetailPanelProps) {
  const [internalDocsExpanded, setInternalDocsExpanded] = useState(false);
  const docsExpanded = docsExpandedProp ?? internalDocsExpanded;
  const setDocsExpanded = onDocsExpandedChange ?? setInternalDocsExpanded;
  const [installedActions, setInstalledActions] = useState<InstalledMcpDetailActions | null>(
    null,
  );
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const docsHeaderRef = useRef<HTMLDivElement>(null);
  const lastDocsScrollSignalRef = useRef(0);

  useLayoutEffect(() => {
    if (detailScrollResetSignal <= 0) {
      return;
    }
    detailScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [detailScrollResetSignal]);

  useLayoutEffect(() => {
    if (docsScrollSignal <= 0 || !docsExpanded) {
      return;
    }
    if (docsScrollSignal === lastDocsScrollSignalRef.current) {
      return;
    }

    const container = detailScrollRef.current;
    const target = docsHeaderRef.current;
    if (!container || !target) {
      return;
    }

    lastDocsScrollSignalRef.current = docsScrollSignal;

    const scrollToDocs = () => {
      scrollElementToTopWithinContainer(container, target);
    };

    scrollToDocs();
    requestAnimationFrame(scrollToDocs);
  }, [docsExpanded, docsScrollSignal]);

  useEffect(() => {
    lastDocsScrollSignalRef.current = 0;
  }, [installedServer?.id]);

  useEffect(() => {
    if (!installedServer) {
      setInstalledActions(null);
    }
  }, [installedServer]);

  const hasSelection = Boolean(installedServer || entry || selectionToken);

  if (!hasSelection) {
    return (
      <YStack flex={1} justify="center" items="center" px={24} py={32}>
        <Text color={colors.muted} fontSize={14} text="center" lineHeight={22} select="none">
          Select a server from the list to view details or install it.
        </Text>
      </YStack>
    );
  }

  const title = installedServer
    ? getInstalledServerTitle(installedServer, entry)
    : entry
      ? getRegistryServerTitle(entry)
      : "";

  const headerInstalled = Boolean(installedServer);

  return (
    <YStack flex={1} minH={0} width="100%" overflow="hidden">
      <YStack shrink={0} px={16} pt={16} pb={12} gap={0} width="100%">
        <McpDetailHeader
          title={title}
          entry={!installedServer ? entry : null}
          installed={headerInstalled}
          onInstalled={onInstalled}
          onRefresh={installedActions?.refresh}
          onDelete={installedActions?.deleteServer}
          onCreate={installedActions?.create}
          refreshing={installedActions?.refreshing}
          saving={installedActions?.saving}
          showCreate={false}
          deleteLabel={`Delete ${installedActions?.serverName || title}`}
        />
      </YStack>

      <div
        ref={detailScrollRef}
        className="td-scroll-y"
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          padding: "0 16px 16px",
          overflowAnchor: "none",
        }}
      >
        <YStack gap={20} width="100%" pb={8}>
          {installedServer ? (
            <>
              <InstalledMcpCard
                server={installedServer}
                detailMode
                hideTitle
                externalHeaderActions
                defaultExpanded
                expanded
                onDetailActionsChange={setInstalledActions}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
              />
              {installedServer && entry ? (
                <InstalledMcpDocsSection
                  key={installedServer.id}
                  entry={entry}
                  expanded={docsExpanded}
                  onExpandedChange={setDocsExpanded}
                  sectionRef={docsHeaderRef}
                />
              ) : null}
            </>
          ) : null}

          {entry && !installedServer ? (
            <McpServerDetailContent entry={entry} embedded hideHeader onInstalled={onInstalled} />
          ) : null}
        </YStack>
      </div>
    </YStack>
  );
}
