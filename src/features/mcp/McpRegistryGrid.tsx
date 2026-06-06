import { useLayoutEffect, useRef, useState } from "react";
import { YStack } from "tamagui";
import { entryKey, type McpServerEntry } from "../../services/mcp_registry";
import { McpServerCard } from "./McpServerCard";

export const MARKET_CARD_MIN_WIDTH = 360;
export const MARKET_CARD_HEIGHT = 188;
const MAX_COLUMNS = 3;
const GRID_GAP = 12;

type McpRegistryGridProps = {
  servers: McpServerEntry[];
  onSelect?: (entry: McpServerEntry) => void;
};

export function McpRegistryGrid({ servers, onSelect }: McpRegistryGridProps) {
  const [columns, setColumns] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateColumns = () => {
      const width = element.clientWidth;
      const nextColumns = Math.min(
        MAX_COLUMNS,
        Math.max(
          1,
          Math.floor((width + GRID_GAP) / (MARKET_CARD_MIN_WIDTH + GRID_GAP)),
        ),
      );
      setColumns((current) => (current === nextColumns ? current : nextColumns));
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(${MARKET_CARD_MIN_WIDTH}px, 1fr))`,
        gap: GRID_GAP,
        width: "100%",
        alignContent: "start",
      }}
    >
      {servers.map((entry) => (
        <YStack
          key={entryKey(entry)}
          minW={0}
          width="100%"
          height={MARKET_CARD_HEIGHT}
        >
          <McpServerCard entry={entry} onSelect={onSelect} />
        </YStack>
      ))}
    </div>
  );
}
