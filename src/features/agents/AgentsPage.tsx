import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, YStack } from "tamagui";
import { ScrollFadePanel } from "../../components/ScrollFadePanel/ScrollFadePanel";
import { InlineLoader } from "../../components/InlineLoader";
import { listAgentRecords, type AgentRecord } from "../../services/agents/recordsApi";
import {
  defaultAgentsPageSession,
  readPageSession,
  writePageSession,
  type AgentsPageSession,
} from "../../session/appSession";
import { colors } from "../../theme";
import { McpInlineSearch } from "../mcp/McpInlineSearch";
import { McpPanel } from "../mcp/McpPanel";
import { AgentsTable } from "./AgentsTable";

const AGENTS_PAGE_SESSION_KEY = "agents";

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AgentsPageSession>(() =>
    readPageSession(AGENTS_PAGE_SESSION_KEY, defaultAgentsPageSession()),
  );

  const { search, scrollTop } = session;

  useEffect(() => {
    writePageSession(AGENTS_PAGE_SESSION_KEY, session);
  }, [session]);

  const setSearch = useCallback((value: string) => {
    setSession((current) => ({ ...current, search: value }));
  }, []);

  const setScrollTop = useCallback((value: number) => {
    setSession((current) =>
      current.scrollTop === value ? current : { ...current, scrollTop: value },
    );
  }, []);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await listAgentRecords();
      setAgents(records);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return agents;
    }
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.kind.toLowerCase().includes(query) ||
        agent.configDirPath.toLowerCase().includes(query),
    );
  }, [agents, search]);

  if (loading) {
    return (
      <YStack flex={1} justify="center" items="center" px={12}>
        <InlineLoader label="Loading agents…" />
      </YStack>
    );
  }

  return (
    <YStack flex={1} minH={0} overflow="hidden" px={16} py={14} gap={12}>
      <Text color={colors.foreground} fontSize={22} fontWeight="700" select="none">
        Agents
      </Text>

      {error ? (
        <Text color={colors.error} fontSize={12} shrink={0}>
          {error}
        </Text>
      ) : null}

      <McpPanel flex={1} minH={0} p={0} overflow="hidden">
        <ScrollFadePanel
          initialScrollTop={scrollTop}
          onScrollTopChange={setScrollTop}
          header={
            <McpInlineSearch
              value={search}
              onChangeText={setSearch}
              placeholder="Search agents"
            />
          }
        >
          <AgentsTable
            agents={filteredAgents}
            onUpdated={() => void loadAgents()}
            onError={setError}
          />

          {agents.length > 0 && filteredAgents.length === 0 ? (
            <Text color={colors.muted} fontSize={13} text="center" py={16} select="none">
              No agents match your search.
            </Text>
          ) : null}
        </ScrollFadePanel>
      </McpPanel>
    </YStack>
  );
}
