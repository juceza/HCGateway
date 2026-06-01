import { Link } from '@tanstack/react-router';

import type { RecordTypeMeta } from '@/lib/recordTypes';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
      to='/records/$type'
      params={{ type: meta.name }}
      data-testid={`card-${meta.name}`}
      className='focus-visible:ring-ring block rounded-xl outline-none focus-visible:ring-2'
    >
      <Card className='gap-3 py-4 transition-shadow hover:shadow-md'>
        <CardHeader>
          <CardTitle className='text-muted-foreground text-sm font-medium'>
            {meta.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p data-testid='card-count' className='text-2xl font-semibold'>
            {count.toLocaleString('en-US')}
          </p>
          <p className='text-muted-foreground text-sm'>
            {count === 1 ? 'record' : 'records'}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
