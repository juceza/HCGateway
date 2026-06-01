import { useMemo } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { groupPopulatedTypes, shortWindow } from '@/lib/dashboard';
import { useCounts } from '@/lib/queries';

import { CountCard } from '@/components/CountCard';
import { SummaryCard } from '@/components/SummaryCard';

// Overview-first dashboard home. Driven by `/counts`: it renders a
// skeleton immediately, then one card per record type with `count > 0`, grouped
// by the six fixed categories. The 8 charted types render a recent value +
// mini-sparkline filled incrementally by their own per-type short-window
// `/fetch` (the `SummaryCard` owns that query and its per-card states); every
// other type shows a count-only card and issues no `/fetch`, bounding the home's
// network cost to the charted types.
export const Route = createFileRoute('/_authed/')({
  component: Dashboard,
});

function Dashboard() {
  const { data: counts, isLoading, isError } = useCounts();
  // One stable short window for every sparkline this render-session.
  const window = useMemo(() => shortWindow(new Date()), []);

  return (
    <main className='mx-auto w-full max-w-5xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-semibold tracking-tight'>
        Your health
      </h1>

      {isLoading && <DashboardSkeleton />}

      {isError && (
        <p data-testid='dashboard-error' className='text-destructive text-sm'>
          Couldn’t load your data. Please try again.
        </p>
      )}

      {!isLoading && !isError && (
        <Populated counts={counts ?? {}} window={window} />
      )}
    </main>
  );
}

function Populated({
  counts,
  window,
}: {
  counts: Record<string, number>;
  window: ReturnType<typeof shortWindow>;
}) {
  const groups = groupPopulatedTypes(counts);

  if (groups.length === 0) {
    return (
      <p data-testid='dashboard-empty' className='text-muted-foreground'>
        No synced data yet. Once your app syncs, your health data shows up here.
      </p>
    );
  }

  return (
    <div className='flex flex-col gap-8'>
      {groups.map((group) => (
        <section
          key={group.category}
          data-testid={`category-${group.category}`}
        >
          <h2 className='text-muted-foreground mb-3 text-sm font-medium tracking-wide uppercase'>
            {group.category}
          </h2>
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
            {group.types.map(({ meta, count }) =>
              meta.charted ? (
                <SummaryCard key={meta.name} meta={meta} window={window} />
              ) : (
                <CountCard key={meta.name} meta={meta} count={count} />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Counts-first skeleton shown while `/counts` loads. */
function DashboardSkeleton() {
  return (
    <div
      data-testid='dashboard-skeleton'
      className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className='bg-muted h-32 animate-pulse rounded-xl' />
      ))}
    </div>
  );
}
