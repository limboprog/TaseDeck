import { useCallback, useEffect, useState } from "react";
import {
  createTopology,
  getStoredTopologies,
  saveTopologies,
} from "./storage";
import { getTopologyRunStatus, startTopology, stopTopology } from "./topologyRunApi";
import type { Topology } from "./types";

export function useTopologies() {
  const [topologies, setTopologies] = useState<Topology[]>(() =>
    getStoredTopologies(),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveTopologies(topologies);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [topologies]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = getStoredTopologies();
      const synced = await Promise.all(
        stored.map(async (topology) => {
          try {
            const status = await getTopologyRunStatus(topology.id, topology.name);
            if (status.running === topology.running) {
              return topology;
            }
            return {
              ...topology,
              running: status.running,
            };
          } catch {
            return topology;
          }
        }),
      );

      if (!cancelled) {
        setTopologies(synced);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const addTopology = useCallback((name: string) => {
    const topology = createTopology(name);
    setTopologies((current) => [topology, ...current]);
    return topology;
  }, []);

  const updateTopology = useCallback(
    (id: string, patch: Partial<Omit<Topology, "id" | "createdAt">>) => {
      setTopologies((current) =>
        current.map((topology) =>
          topology.id === id
            ? {
                ...topology,
                ...patch,
                updatedAt: new Date().toISOString(),
              }
            : topology,
        ),
      );
    },
    [],
  );

  const removeTopology = useCallback((id: string) => {
    setTopologies((current) => {
      const topology = current.find((entry) => entry.id === id);
      if (topology) {
        void stopTopology(id, topology.name).catch(() => undefined);
      }
      return current.filter((entry) => entry.id !== id);
    });
  }, []);

  const toggleRunning = useCallback((id: string) => {
    setTopologies((current) => {
      const topology = current.find((entry) => entry.id === id);
      if (!topology) {
        return current;
      }

      const willRun = !topology.running;
      const next = current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              running: willRun,
              updatedAt: new Date().toISOString(),
            }
          : entry,
      );

      const action = willRun
        ? startTopology(id, topology.name)
        : stopTopology(id, topology.name);

      void action.catch(() => {
        setTopologies((latest) =>
          latest.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  running: !willRun,
                  updatedAt: new Date().toISOString(),
                }
              : entry,
          ),
        );
      });

      return next;
    });
  }, []);

  return {
    topologies,
    addTopology,
    updateTopology,
    removeTopology,
    toggleRunning,
  };
}
