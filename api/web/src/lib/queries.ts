// TanStack Query v5 hooks — the single seam the screens read data through.
//
// Two hooks sit over the API client (`api.ts`) and the pure transforms
// (`transforms.ts`):
//
//  - `useCounts` drives the overview-first dashboard. `/counts` is
//    cheap and changes only as the device syncs, so it carries a ~30s
//    `staleTime` — repeated card mounts within that window
//    reuse the cache instead of re-hitting the server.
//  - `useRecords(displayName, window)` is the per-type, time-window-bound read.
//    It shapes the allowlisted `/fetch` query through `buildTimeWindowQuery`
//    (the ONLY query shaper) and delegates the casing→collection mapping to
//    `fetchRecords` (which routes through `displayToCollection`), so no casing
//    or query shaping is duplicated here. Its `staleTime` is ~0: a
//    record window is re-fetched whenever it is observed again.
//
// V1 is strictly read-only, so there is **no cache invalidation** anywhere
// windows simply key their own cache entries.

import { QueryClient, useQuery } from '@tanstack/react-query';

import { fetchRecords, getCounts, type HealthRecord } from './api';
import { buildTimeWindowQuery, type TimeWindow } from './transforms';

/** ~30s window for `/counts`. */
const COUNTS_STALE_TIME_MS = 30_000;
/** ~0 for record windows — re-fetch on every observation. */
const RECORDS_STALE_TIME_MS = 0;

/**
 * The app-wide query client. Mounted once in `main.tsx`. `retry: 1` keeps a
 * single transient retry without hammering the API on a hard failure (e.g. an
 * `AuthError`, which the router turns into a redirect). No default `staleTime`
 * — each hook sets its own.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
});

/**
 * Per-type document counts keyed by display name. Drives the dashboard's
 * summary cards. Cached for ~30s. Loading/error/empty surface through the
 * standard query result (`isLoading`/`isError`/`data`) so screens render
 * per-card states.
 */
export function useCounts() {
  return useQuery({
    queryKey: ['counts'],
    queryFn: getCounts,
    staleTime: COUNTS_STALE_TIME_MS,
  });
}

/**
 * Records for one display-named type over a time window. The query is keyed by
 * `type + window` (normalised ISO bounds), so changing the window produces a
 * new cache entry and triggers a re-fetch while previously seen windows stay
 * cached. The error is surfaced through `isError`/`error` — it is not thrown to
 * render, so screens can show a per-view error state.
 */
export function useRecords(displayName: string, window: TimeWindow) {
  const query = buildTimeWindowQuery(window);
  return useQuery<HealthRecord[]>({
    queryKey: ['records', displayName, query.start?.$gte, query.start?.$lte],
    queryFn: () => fetchRecords(displayName, query),
    staleTime: RECORDS_STALE_TIME_MS,
  });
}
