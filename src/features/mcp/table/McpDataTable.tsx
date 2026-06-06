import type { CSSProperties, ReactNode, RefObject } from "react";
import { mcpBlackBlock, mcpTableHeaderCell, mcpTableHeaderText } from "../mcpTableStyles";

export type McpTableColumn = {
  key: string;
  header: ReactNode;
  headerStyle?: CSSProperties;
};

export type McpDataTableProps = {
  columns: McpTableColumn[];
  gridColumns: string;
  columnGap?: number;
  children: ReactNode;
  empty?: ReactNode;
  shellRef?: RefObject<HTMLDivElement | null>;
  shellStyle?: CSSProperties;
  /** Grid only — no outer `mcpBlackBlock` shell (nested tables). */
  bare?: boolean;
};

export function McpDataTable({
  columns,
  gridColumns,
  columnGap = 0,
  children,
  empty,
  shellRef,
  shellStyle,
  bare = false,
}: McpDataTableProps) {
  const grid = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: gridColumns,
        columnGap: columnGap > 0 ? columnGap : undefined,
        alignItems: "stretch",
      }}
    >
        {columns.map((column) => (
          <div key={column.key} style={{ ...mcpTableHeaderCell, ...column.headerStyle }}>
            {typeof column.header === "string" ? (
              <span style={mcpTableHeaderText}>{column.header}</span>
            ) : (
              column.header
            )}
          </div>
        ))}
        {empty ?? children}
    </div>
  );

  if (bare) {
    return (
      <div ref={shellRef} style={shellStyle}>
        {grid}
      </div>
    );
  }

  return (
    <div ref={shellRef} style={{ ...mcpBlackBlock, ...shellStyle }}>
      {grid}
    </div>
  );
}

export type McpTableRowProps = {
  rowId: string;
  children: ReactNode;
};

export function McpTableRow({ rowId, children }: McpTableRowProps) {
  return (
    <div data-mcp-table-row={rowId} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
