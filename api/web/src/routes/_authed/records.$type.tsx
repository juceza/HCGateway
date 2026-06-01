import { useEffect, useMemo, useState } from 'react';

import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { TriangleAlert } from 'lucide-react';

import type { HealthRecord } from '@/lib/api';
import { useRecords } from '@/lib/queries';
import {
  isWideWindow,
  normalizeWindowSearch,
  pageCount,
  paginate,
  presetForWindow,
  type SortDirection,
  sortRows,
  toTableRows,
  toTimeWindow,
  windowForPreset,
  type WindowPreset,
  type WindowSearch,
} from '@/lib/recordDetail';
import { getRecordType } from '@/lib/recordTypes';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { JsonDialog } from '@/components/JsonDialog';
import { RecordChart } from '@/components/RecordChart';
import { RecordTable } from '@/components/RecordTable';
import { WindowSelector } from '@/components/WindowSelector';

// Per-type detail view. The view is bound to a typed `start`/`end`
// search-param window (default last 7 days): the day/week/month
// selector re-navigates the window, which re-keys `useRecords` and refetches.
// The registry `charted` flag selects a rich Recharts trend chart (8 types) over
// the readable table fallback (the rest); both render the table so any record's
// full decrypted JSON is reachable via the detail dialog. Sorting and pagination
// run client-side over the returned window (no server-side paging). A wide-window
// notice warns on heavy types, and loading/empty/error states cover every state.
/** Raw, optional search-params; the component normalises them to a window. */
interface RawWindowSearch {
  start?: string;
  end?: string;
}

export const Route = createFileRoute('/_authed/records/$type')({
  // Pass through only string bounds; both are optional so links into this route
  // need not supply a window. The 7-day default is applied at read time below.
  validateSearch: (search: Record<string, unknown>): RawWindowSearch => ({
    start: typeof search.start === 'string' ? search.start : undefined,
    end: typeof search.end === 'string' ? search.end : undefined,
  }),
  component: RecordDetail,
});

function RecordDetail() {
  const { type } = Route.useParams();
  const raw = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // Normalise once per distinct search-param pair: when no window is in the URL
  // this defaults to last-7-days ending "now" — memoised so the default's "now"
  // doesn't drift each render and re-key `useRecords` into a refetch loop.
  const window: WindowSearch = useMemo(
    () => normalizeWindowSearch(raw, new Date()),
    // Intentionally key only on the two search fields, not the whole `raw`
    // object, so the default's "now" doesn't drift and refetch-loop each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw.start, raw.end],
  );

  const meta = getRecordType(type);
  const { data, isLoading, isError } = useRecords(type, toTimeWindow(window));

  const [sort, setSort] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<HealthRecord | null>(null);

  const sortedRows = useMemo(
    () => sortRows(toTableRows(data ?? []), sort),
    [data, sort],
  );
  const totalPages = pageCount(sortedRows.length);
  const pagedRows = paginate(sortedRows, page);

  // Keep the page in range as the window/sort/data change underneath it.
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount(sortedRows.length)));
  }, [sortedRows.length]);

  const activePreset = presetForWindow(window);
  const wide = isWideWindow(window, type);

  function selectPreset(preset: WindowPreset) {
    setPage(1);
    navigate({ search: windowForPreset(preset, new Date()) });
  }

  function toggleSort() {
    setPage(1);
    setSort((s) => (s === 'asc' ? 'desc' : 'asc'));
  }

  const hasData = sortedRows.length > 0;

  return (
    <main className='mx-auto w-full max-w-5xl px-4 py-8'>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
        <h1 data-testid='record-detail' className='text-2xl font-semibold'>
          {meta?.label ?? type}
        </h1>
        <WindowSelector active={activePreset} onSelect={selectPreset} />
      </div>

      {wide && (
        <Alert
          variant='warning'
          data-testid='wide-window-notice'
          className='mb-6'
        >
          <TriangleAlert />
          <AlertTitle>Wide window on a high-frequency type</AlertTitle>
          <AlertDescription>
            This type records many samples; a wide window downloads a large
            amount of data and may take a few seconds. Narrow the window for a
            faster, more readable view.
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div data-testid='detail-skeleton' className='flex flex-col gap-4'>
          <div className='bg-muted h-64 animate-pulse rounded-xl' />
          <div className='bg-muted h-40 animate-pulse rounded-xl' />
        </div>
      )}

      {isError && (
        <p data-testid='detail-error' className='text-destructive text-sm'>
          Couldn’t load this data. Please try again.
        </p>
      )}

      {!isLoading && !isError && !hasData && (
        <p data-testid='detail-empty' className='text-muted-foreground'>
          No records in this window. Try widening the time window.
        </p>
      )}

      {!isLoading && !isError && hasData && (
        <div className='flex flex-col gap-6'>
          <p
            data-testid='count-summary'
            className='text-muted-foreground text-sm'
          >
            {sortedRows.length} {sortedRows.length === 1 ? 'record' : 'records'}{' '}
            in this window
          </p>

          {meta?.charted && (
            <RecordChart
              records={data ?? []}
              meta={meta}
              window={toTimeWindow(window)}
            />
          )}

          <RecordTable
            rows={pagedRows}
            sort={sort}
            onToggleSort={toggleSort}
            onView={setSelected}
          />

          <div className='flex items-center justify-between gap-4'>
            <p
              data-testid='page-info'
              className='text-muted-foreground text-sm'
            >
              Page {Math.min(page, totalPages)} of {totalPages}
            </p>
            <div className='flex gap-2'>
              <Button
                type='button'
                size='sm'
                variant='outline'
                data-testid='page-prev'
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                data-testid='page-next'
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <JsonDialog
        record={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </main>
  );
}
