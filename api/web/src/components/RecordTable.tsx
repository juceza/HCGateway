import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HealthRecord } from "@/lib/api";
import {
  formatTimestamp,
  type SortDirection,
  type TableRow as Row,
} from "@/lib/recordDetail";

// Readable table fallback (start / end / source app) for any type's records
// . Sorting and pagination are client-side over the returned window
// the route owns the sorted/paginated `rows` and the sort direction;
// this component renders them and surfaces the sort toggle + per-row "view
// details" affordance that opens the JSON dialog.

interface RecordTableProps {
  rows: Row[];
  sort: SortDirection;
  onToggleSort: () => void;
  onView: (record: HealthRecord) => void;
}

export function RecordTable({
  rows,
  sort,
  onToggleSort,
  onView,
}: RecordTableProps) {
  return (
    <Table data-testid="record-table">
      <TableHeader>
        <TableRow>
          <TableHead>
            <button
              type="button"
              onClick={onToggleSort}
              data-testid="sort-start"
              className="inline-flex items-center gap-1 font-medium outline-none hover:text-foreground focus-visible:text-foreground"
            >
              Start
              {sort === "asc" ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              )}
            </button>
          </TableHead>
          <TableHead>End</TableHead>
          <TableHead>Source app</TableHead>
          <TableHead className="text-right">Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-testid={`row-${row.id}`}>
            <TableCell className="text-foreground">
              {formatTimestamp(row.start)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatTimestamp(row.end)}
            </TableCell>
            <TableCell className="text-muted-foreground">{row.app}</TableCell>
            <TableCell className="text-right">
              <Button
                type="button"
                size="xs"
                variant="outline"
                data-testid={`view-${row.id}`}
                onClick={() => onView(row.record)}
              >
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
