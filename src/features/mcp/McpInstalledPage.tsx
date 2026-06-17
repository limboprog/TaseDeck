import { useCallback, useEffect, useMemo, useState } from "react";
import { IoAdd } from "../../icons";
import { Button, Text, XStack, YStack } from "tamagui";
import { ScrollFadePanel } from "../../components/ScrollFadePanel/ScrollFadePanel";
import { McpPanel } from "./McpPanel";
import { InlineLoader } from "../../components/InlineLoader";
import { initRegistryWorker } from "../../services/mcp_registry";
import { useInstalledMcpServers } from "../../services/mcp_installed";
import {
  defaultMcpPageSession,
  readPageSession,
  writePageSession,
  type McpPageSession,
} from "../../session/appSession";
import { colors } from "../../theme";
import { createManualMcpDraft } from "./createManualMcpDraft";
import { McpInlineSearch } from "./McpInlineSearch";
import { InstalledMcpCard } from "./InstalledMcpCard";

const MCP_PAGE_SESSION_KEY = "mcp-installed";

type McpInstalledPageProps = {
  mcpActive?: boolean;
};

export function McpInstalledPage({ mcpActive = true }: McpInstalledPageProps) {
  const { servers, loading, error, refresh } = useInstalledMcpServers();
  const [session, setSession] = useState<McpPageSession>(() =>
    readPageSession(MCP_PAGE_SESSION_KEY, defaultMcpPageSession()),
  );
  const [manualDraft, setManualDraft] = useState(() => null as ReturnType<typeof createManualMcpDraft> | null);

  const { search, expandedServerIds, scrollTop } = session;

  useEffect(() => {
    writePageSession(MCP_PAGE_SESSION_KEY, session);
  }, [session]);

  useEffect(() => {
    initRegistryWorker();
  }, []);

  useEffect(() => {
    if (!mcpActive) {
      return;
    }
    const stored = readPageSession(MCP_PAGE_SESSION_KEY, defaultMcpPageSession());
    if (!stored.pendingManualDraft) {
      return;
    }
    setManualDraft(createManualMcpDraft());
    setSession((current) => {
      const next = { ...current, pendingManualDraft: false };
      writePageSession(MCP_PAGE_SESSION_KEY, next);
      return next;
    });
  }, [mcpActive]);

  const setSearch = useCallback((value: string) => {
    setSession((current) => ({ ...current, search: value }));
  }, []);

  const setScrollTop = useCallback((value: number) => {
    setSession((current) =>
      current.scrollTop === value ? current : { ...current, scrollTop: value },
    );
  }, []);

  const handleServerDeleted = useCallback((serverId: number) => {
    setSession((current) => ({
      ...current,
      expandedServerIds: current.expandedServerIds.filter((id) => id !== serverId),
    }));
  }, []);

  const setServerExpanded = useCallback((serverId: number, expanded: boolean) => {
    setSession((current) => {
      const has = current.expandedServerIds.includes(serverId);
      if (expanded && has) {
        return current;
      }
      if (!expanded && !has) {
        return current;
      }
      const expandedServerIds = expanded
        ? [...current.expandedServerIds, serverId]
        : current.expandedServerIds.filter((id) => id !== serverId);
      return { ...current, expandedServerIds };
    });
  }, []);

  const filteredServers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return servers;
    }
    return servers.filter((server) => server.name.toLowerCase().includes(query));
  }, [search, servers]);

  const handleAddManual = () => {
    setManualDraft(createManualMcpDraft());
  };

  if (loading) {
    return (
      <YStack flex={1} justify="center" items="center" px={12}>
        <InlineLoader label="Loading installed servers…" />
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack flex={1} justify="center" items="center" px={12}>
        <Text color={colors.error} fontSize={14} text="center">
          {error}
        </Text>
      </YStack>
    );
  }

  const showEmptyHint =
    !manualDraft && servers.length === 0 && !search.trim();

  return (
    <YStack flex={1} minH={0} overflow="hidden" px={16} py={14} gap={12}>
      <Text color={colors.foreground} fontSize={22} fontWeight="700" select="none">
        MCP
      </Text>

      <McpPanel flex={1} minH={0} p={0} overflow="hidden">
        <ScrollFadePanel
          initialScrollTop={scrollTop}
          onScrollTopChange={setScrollTop}
          header={
            <XStack width="100%" gap={8} items="center">
              <McpInlineSearch
                flex={1}
                value={search}
                onChangeText={setSearch}
                placeholder="Search servers"
              />

              <Button
                width={36}
                height={36}
                p={0}
                rounded={8}
                bg={colors.accent}
                color="#fff"
                aria-label="Add server manually"
                disabled={manualDraft !== null}
                opacity={manualDraft ? 0.45 : 1}
                onPress={handleAddManual}
              >
                <IoAdd size={18} />
              </Button>
            </XStack>
          }
        >
          {showEmptyHint ? (
            <Text color={colors.muted} fontSize={13} text="center" py={24} select="none">
              No MCP servers yet. Use + to add one manually or install from Market.
            </Text>
          ) : null}

          {manualDraft ? (
            <InstalledMcpCard
              key="manual-draft"
              server={manualDraft}
              isNew
              onCreated={() => setManualDraft(null)}
              onUpdated={() => void refresh({ silent: true })}
            />
          ) : null}

          {filteredServers.map((server) => (
            <InstalledMcpCard
              key={server.id}
              server={server}
              expanded={expandedServerIds.includes(server.id)}
              onExpandedChange={(expanded) => setServerExpanded(server.id, expanded)}
              onUpdated={() => void refresh({ silent: true })}
              onDeleted={handleServerDeleted}
            />
          ))}

          {!showEmptyHint && filteredServers.length === 0 && !manualDraft ? (
            <Text color={colors.muted} fontSize={13} text="center" py={16} select="none">
              No servers match your search.
            </Text>
          ) : null}
        </ScrollFadePanel>
      </McpPanel>
    </YStack>
  );
}
