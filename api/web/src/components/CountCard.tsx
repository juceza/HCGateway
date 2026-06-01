import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecordTypeMeta } from "@/lib/recordTypes";

// Count-only card for the non-charted types. It shows label + record
// count from the cached `/counts` map and issues **no** `/fetch` — bounding the
// home's network cost to the 8 charted types. Like the summary card, the whole
// card links into the type detail route (`/records/$type`).

interface CountCardProps {
  meta: RecordTypeMeta;
  count: number;
}

export function CountCard({ meta, count }: CountCardProps) {
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
        <CardContent>
          <p data-testid="card-count" className="text-2xl font-semibold">
            {count.toLocaleString("en-US")}
          </p>
          <p className="text-sm text-muted-foreground">
            {count === 1 ? "record" : "records"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
