import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '@/lib/api';
import { type AuthState, setAuth } from '@/lib/auth';

import { routeTree } from '@/routeTree.gen';

// The detail route is exercised end-to-end through the real router + query
// layer; only the API boundary (`fetchRecords`) is spied. This proves the
// windowed fetch→render flow: default window, chart vs table by `charted`,
// the JSON dialog, client-side sort/pagination, the wide-window notice, and
// the loading/empty/error states.

const SESSION: AuthState = {
  token: 'tok-1',
  refresh: 'ref-1',
  expiry: '2026-06-01T12:00:00Z',
  username: 'alice',
};

const DAY = 86_400_000;

function recentRecord(
  id: string,
  data: Record<string, unknown>,
  startMsAgo = DAY,
): api.HealthRecord {
  return {
    _id: id,
    id,
    data,
    start: new Date(Date.now() - startMsAgo).toISOString(),
    end: null,
    app: 'com.example',
  };
}

function renderRoute(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  localStorage.clear();
  setAuth(SESSION);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('per-type detail route', () => {
  it('defaults to a last-7-days window when no search-param is present', async () => {
    const spy = vi
      .spyOn(api, 'fetchRecords')
      .mockResolvedValue([recentRecord('a', { count: 1000 })]);

    renderRoute('/records/Steps');

    await screen.findByTestId('record-detail');
    await waitFor(() => expect(spy).toHaveBeenCalled());

    // The window passed to fetch spans ~7 days (the default).
    const query = spy.mock.calls[0][1] as {
      start?: { $gte?: string; $lte?: string };
    };
    const span =
      Date.parse(query.start!.$lte!) - Date.parse(query.start!.$gte!);
    expect(Math.round(span / DAY)).toBe(7);
    // The window selector highlights "Week" for the default span.
    expect(screen.getByTestId('window-week')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('renders a chart with min/max preserved for a charted amplitude type', async () => {
    // HeartRate carries per-sample beatsPerMinute; bucketing keeps min/max.
    vi.spyOn(api, 'fetchRecords').mockResolvedValue([
      recentRecord('h1', {
        samples: [
          {
            time: new Date(Date.now() - 2 * DAY).toISOString(),
            beatsPerMinute: 55,
          },
          {
            time: new Date(Date.now() - 2 * DAY + 1000).toISOString(),
            beatsPerMinute: 130,
          },
        ],
      }),
    ]);

    renderRoute('/records/HeartRate');

    const chart = await screen.findByTestId('record-chart');
    expect(chart).toHaveAttribute('data-amplitude', 'true');
    // The accessible caption exposes the preserved extremes (55..130 bpm).
    expect(screen.getByTestId('chart-caption')).toHaveTextContent('min 55');
    expect(screen.getByTestId('chart-caption')).toHaveTextContent('max 130');
  });

  it('renders the table + count summary for a non-charted type (no chart)', async () => {
    vi.spyOn(api, 'fetchRecords').mockResolvedValue([
      recentRecord('d1', { distance: 100 }),
      recentRecord('d2', { distance: 200 }, 2 * DAY),
    ]);

    renderRoute('/records/Distance');

    expect(await screen.findByTestId('record-table')).toBeInTheDocument();
    expect(screen.getByTestId('count-summary')).toHaveTextContent(
      '2 records in this window',
    );
    expect(screen.getByText('Source app')).toBeInTheDocument();
    // A non-charted type renders no chart.
    expect(screen.queryByTestId('record-chart')).not.toBeInTheDocument();
  });

  it('switches the selector to month, updating the search-param and refetching', async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api, 'fetchRecords')
      .mockResolvedValue([recentRecord('a', { count: 1 })]);

    const router = renderRoute('/records/Steps');
    await screen.findByTestId('record-detail');
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('window-month'));

    // The URL search-param window widens to ~30 days and a refetch fires.
    await waitFor(() => {
      const search = router.state.location.search as {
        start?: string;
        end?: string;
      };
      expect(search.start).toBeTruthy();
      const span = Date.parse(search.end!) - Date.parse(search.start!);
      expect(Math.round(span / DAY)).toBe(30);
    });
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(1));
  });

  it('opens the JSON dialog and pretty-prints the full record', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'fetchRecords').mockResolvedValue([
      recentRecord('rec-xyz', { distance: 42 }),
    ]);

    renderRoute('/records/Distance');

    await user.click(await screen.findByTestId('view-rec-xyz'));

    const dialog = await screen.findByTestId('json-dialog');
    const content = within(dialog).getByTestId('json-content');
    // Pretty-printed (indented) and contains the full decrypted record.
    expect(content.textContent).toContain('"_id": "rec-xyz"');
    expect(content.textContent).toContain('"distance": 42');
    expect(content.textContent).toContain('\n  ');
  });

  it('sorts rows by start and pages over the returned window client-side', async () => {
    const user = userEvent.setup();
    // 30 records → 2 pages at the 25/page default; distinct, ordered starts.
    const records = Array.from({ length: 30 }, (_, i) =>
      recentRecord(`r${i}`, { distance: i }, (i + 1) * 1000),
    );
    vi.spyOn(api, 'fetchRecords').mockResolvedValue(records);

    renderRoute('/records/Distance');

    await screen.findByTestId('record-table');
    expect(screen.getByTestId('page-info')).toHaveTextContent('Page 1 of 2');
    // Default sort is most-recent-first: r0 (smallest msAgo) is newest.
    let rows = screen.getAllByTestId(/^row-/);
    expect(rows[0]).toHaveAttribute('data-testid', 'row-r0');

    // Page 2 holds the remaining 5 rows.
    await user.click(screen.getByTestId('page-next'));
    await waitFor(() =>
      expect(screen.getByTestId('page-info')).toHaveTextContent('Page 2 of 2'),
    );
    expect(screen.getAllByTestId(/^row-/)).toHaveLength(5);

    // Toggling sort flips to oldest-first and resets to page 1.
    await user.click(screen.getByTestId('sort-start'));
    await waitFor(() =>
      expect(screen.getByTestId('page-info')).toHaveTextContent('Page 1 of 2'),
    );
    rows = screen.getAllByTestId(/^row-/);
    expect(rows[0]).toHaveAttribute('data-testid', 'row-r29');
  });

  it('shows the wide-window notice for a heavy type over a wide window', async () => {
    vi.spyOn(api, 'fetchRecords').mockResolvedValue([
      recentRecord('h1', {
        samples: [
          {
            time: new Date(Date.now() - DAY).toISOString(),
            beatsPerMinute: 60,
          },
        ],
      }),
    ]);

    // A ~30-day explicit window on HeartRate (heavy) trips the notice.
    const start = new Date(Date.now() - 30 * DAY).toISOString();
    const end = new Date().toISOString();
    renderRoute(
      `/records/HeartRate?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    );

    expect(await screen.findByTestId('wide-window-notice')).toBeInTheDocument();
  });

  it('does not show the wide-window notice on the default window', async () => {
    vi.spyOn(api, 'fetchRecords').mockResolvedValue([
      recentRecord('h1', {
        samples: [
          {
            time: new Date(Date.now() - DAY).toISOString(),
            beatsPerMinute: 60,
          },
        ],
      }),
    ]);

    renderRoute('/records/HeartRate');

    await screen.findByTestId('record-chart');
    expect(screen.queryByTestId('wide-window-notice')).not.toBeInTheDocument();
  });

  it('shows the empty state when the window has no records', async () => {
    vi.spyOn(api, 'fetchRecords').mockResolvedValue([]);

    renderRoute('/records/Steps');

    expect(await screen.findByTestId('detail-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('record-table')).not.toBeInTheDocument();
  });

  it('shows the error state when the query fails', async () => {
    vi.spyOn(api, 'fetchRecords').mockRejectedValue(new api.ApiError(500, 'x'));

    renderRoute('/records/Steps');

    expect(await screen.findByTestId('detail-error')).toBeInTheDocument();
  });

  it('shows a loading skeleton while the query is in flight', async () => {
    vi.spyOn(api, 'fetchRecords').mockReturnValue(new Promise(() => {}));

    renderRoute('/records/Steps');

    expect(await screen.findByTestId('detail-skeleton')).toBeInTheDocument();
  });
});
