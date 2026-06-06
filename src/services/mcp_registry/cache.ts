import type { McpServerEntry, McpSourceId } from "./types";
import {
  filterAndSortEntries,
  mergeUniqueEntries,
  normalizeSearch,
} from "./searchCore";

export type SearchSession = {
  search: string;
  servers: McpServerEntry[];
  nextCursor?: string;
  hasMore: boolean;
  loaded?: boolean;
};

export class RegistrySearchCache {
  private sessions = new Map<string, SearchSession>();

  sessionKey(source: McpSourceId, search: string): string {
    return `${source}:${normalizeSearch(search)}`;
  }

  get(source: McpSourceId, search: string): SearchSession | undefined {
    return this.sessions.get(this.sessionKey(source, search));
  }

  getAncestorEntries(
    source: McpSourceId,
    search: string,
  ): McpServerEntry[] | null {
    const normalized = normalizeSearch(search);
    if (!normalized) {
      return null;
    }

    const exact = this.get(source, search);
    if (exact) {
      return exact.servers;
    }

    for (let length = normalized.length - 1; length >= 1; length -= 1) {
      const ancestor = normalized.slice(0, length);
      const session = this.sessions.get(`${source}:${ancestor}`);
      if (session?.servers.length) {
        return session.servers;
      }
    }

    return null;
  }

  getAncestorPreview(
    source: McpSourceId,
    search: string,
  ): McpServerEntry[] {
    const entries = this.getAncestorEntries(source, search);
    if (!entries) {
      return [];
    }

    const exact = this.get(source, search);
    if (exact) {
      return exact.servers;
    }

    return filterAndSortEntries(entries, search);
  }

  replacePage(
    source: McpSourceId,
    search: string,
    servers: McpServerEntry[],
    nextCursor?: string,
  ): SearchSession {
    const normalized = normalizeSearch(search);
    const session: SearchSession = {
      search: normalized,
      servers: normalized
        ? filterAndSortEntries(servers, search)
        : [...servers],
      nextCursor,
      hasMore: Boolean(nextCursor),
      loaded: true,
    };
    this.sessions.set(this.sessionKey(source, search), session);
    return session;
  }

  appendPage(
    source: McpSourceId,
    search: string,
    incoming: McpServerEntry[],
    nextCursor?: string,
  ): SearchSession {
    const existing = this.get(source, search);
    const merged = mergeUniqueEntries(existing?.servers ?? [], incoming);
    return this.replacePage(source, search, merged, nextCursor);
  }

  clearSource(source: McpSourceId): void {
    for (const key of this.sessions.keys()) {
      if (key.startsWith(`${source}:`)) {
        this.sessions.delete(key);
      }
    }
  }

  clearCatalogSearch(search: string): void {
    this.sessions.delete(this.sessionKey("all", search));
  }

  exportAllSessions(): Array<{ key: string; session: SearchSession }> {
    return Array.from(this.sessions.entries()).map(([key, session]) => ({
      key,
      session,
    }));
  }

  exportSessions(source: McpSourceId): Array<{ key: string; session: SearchSession }> {
    const prefix = `${source}:`;
    const items: Array<{ key: string; session: SearchSession }> = [];

    for (const [key, session] of this.sessions.entries()) {
      if (key.startsWith(prefix)) {
        items.push({ key, session });
      }
    }

    return items;
  }

  importSession(
    source: McpSourceId,
    search: string,
    session: SearchSession,
  ): void {
    this.sessions.set(this.sessionKey(source, search), session);
  }
}

export const registrySearchCache = new RegistrySearchCache();
