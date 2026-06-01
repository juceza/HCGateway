import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/Sparkline";
import { formatValue, latestValue, toSparklinePoints } from "@/lib/dashboard";
import { useRecords } from "@/lib/queries";
import type { RecordTypeMeta } from "@/lib/recordTypes";
import type { TimeWindow } from "@/lib/transforms";

// Summary card for one of the 8 charted high-value types. The card
// header (label) renders immediately from the cached counts; the body then
// fills incrementally from a per-type short-window `/fetch` (`useRecords`),
// showing a per-card skeleton while it loads, an empty state when the window has
// no usable records, and an error state on failure. The whole card is
// a link into the type detail route (`/records/$type`).

interface SummaryCardProps {
  meta: RecordTypeMeta;
  window: TimeWindow;
}

export function SummaryCard({ meta, window }: SummaryCardProps) {
  const { data, isLoading, isError } = useRecords(meta.name, window);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div data-testid="card-skeleton" className="flex flex-col gap-2">
        <div className="h-7 w-20 animate-pulse rounded bg-muted" />
        <div className="h-9 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  } else if (isError) {
    body = (
      <p data-testid="card-error" className="text-sm text-destructive">
        Couldn’t load
      </p>
    );
  } else {
    const records = data ?? [];
    const recent = latestValue(records, meta.name);
    const points = toSparklinePoints(records, meta.name, window);
    if (recent === null || points.length === 0) {
      body = (
        <p data-testid="card-empty" className="text-sm text-muted-foreground">
          No recent data
        </p>
      );
    } else {
      body = (
        <div className="flex flex-col gap-2">
          <p data-testid="card-value" className="text-2xl font-semibold">
            {formatValue(recent, meta)}
          </p>
          <Sparkline points={points} />
        </div>
      );
    }
  }

  return (
    <Link
      to="/records/$type"
      params={{ type: meta.name }}
      data-testid={`card-${meta.name}`}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="gap-3 py-4 transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {meta.label}
          </CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </Link>
  );
}
