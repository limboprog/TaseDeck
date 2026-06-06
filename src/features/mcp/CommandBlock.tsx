import { McpDataTable, McpTableRow } from "./table/McpDataTable";
import {
  McpTableCell,
  McpTableHeaderCopy,
  McpTableHeaderLabel,
  McpTablePlainText,
} from "./table/McpTableCells";

type CommandBlockProps = {
  command: string;
  label?: string;
};

export function CommandBlock({ command, label = "bash" }: CommandBlockProps) {
  const display = command.trim();

  return (
    <McpDataTable
      gridColumns="minmax(0, 1fr)"
      columns={[
        {
          key: "body",
          header: (
            <>
              <McpTableHeaderLabel>{label}</McpTableHeaderLabel>
              <McpTableHeaderCopy value={display} disabled={!display} />
            </>
          ),
          headerStyle: { justifyContent: "space-between" },
        },
      ]}
    >
      <McpTableRow rowId="command-body">
        <McpTableCell isLastRow>
          <McpTablePlainText
            value={display}
            placeholder="—"
            monospace
            isRowExpanded
          />
        </McpTableCell>
      </McpTableRow>
    </McpDataTable>
  );
}
