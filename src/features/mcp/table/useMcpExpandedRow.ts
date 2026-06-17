import { useEffect, type RefObject } from "react";
import {
  findScrollParent,
  getTableRowAnchor,
  preserveScrollWhile,
} from "../preserveScrollOnLayout";

/** Row expand: click row opens it; click elsewhere collapses. */
export function useMcpExpandedRow(
  expandedRowId: string | null,
  setExpandedRowId: (id: string | null) => void,
  tableRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-mcp-row-interactive]")) {
        return;
      }

      const row = target.closest("[data-mcp-table-row]");
      if (row) {
        const rowId = row.getAttribute("data-mcp-table-row");
        if (rowId) {
          const anchor = getTableRowAnchor(row);
          const scrollParent = findScrollParent(anchor);
          preserveScrollWhile(scrollParent, anchor, () => {
            setExpandedRowId(expandedRowId === rowId ? null : rowId);
          });
        }
        return;
      }

      if (!expandedRowId) {
        return;
      }

      if (tableRef.current?.contains(target)) {
        const scrollParent = findScrollParent(tableRef.current);
        preserveScrollWhile(scrollParent, tableRef.current, () => {
          setExpandedRowId(null);
        });
        return;
      }

      setExpandedRowId(null);
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [expandedRowId, setExpandedRowId, tableRef]);
}
