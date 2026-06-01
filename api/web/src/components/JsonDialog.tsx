import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HealthRecord } from "@/lib/api";
import { prettyJson } from "@/lib/recordDetail";

// Pretty-printed JSON detail dialog for the full decrypted record.
// Controlled by the route: `record` is the selected row's record (or `null`
// when closed). Every type — charted or table — exposes its raw record here, so
// nothing the user syncs is hidden behind technical output.

interface JsonDialogProps {
  record: HealthRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JsonDialog({ record, open, onOpenChange }: JsonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="json-dialog" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record details</DialogTitle>
          <DialogDescription>
            The full decrypted record, as stored on your server.
          </DialogDescription>
        </DialogHeader>
        {record && (
          <pre
            data-testid="json-content"
            className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed"
          >
            {prettyJson(record)}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
