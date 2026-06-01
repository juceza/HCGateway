import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from './api';
import { setAuth } from './auth';
import { useCounts, useRecords } from './queries';
import { buildTimeWindowQuery, type TimeWindow } from './transforms';

// Unit tests spy on the API client so the hooks are exercised in isolation;
// `restoreAllMocks` reinstates the real exports, so the integration test below
// drives the real `fetchRecords` path through a mocked global `fetch`.

const WINDOW: TimeWindow = {
  start: '2026-05-25T00:00:00.000Z',
  end: '2026-06-01T00:00:00.000Z',
};

/** A fresh client per test with retries off so error states settle fast. */
function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Wrap a hook under its own `QueryClientProvider`. */
function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCounts', () => {
  it('returns data from getCounts and transitions loading→success', async () => {
    const counts = { Steps: 1234, HeartRate: 42 };
    vi.spyOn(api, 'getCounts').mockResolvedValue(counts);

    const { result } = renderHook(() => useCounts(), {
      wrapper: wrapperFor(newClient()),
    });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(counts);
    expect(api.getCounts).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error through the error state, not a throw', async () => {
    vi.spyOn(api, 'getCounts').mockRejectedValue(new api.ApiError(500, 'boom'));

    const { result } = renderHook(() => useCounts(), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(api.ApiError);
    expect(result.current.data).toBeUndefined();
  });
});

describe('useRecords', () => {
  it('builds the query via transforms and calls fetchRecords', async () => {
    const records = [
      {
        _id: '1',
        id: '1',
        data: { count: 100 },
        start: '2026-05-26T08:00:00Z',
        end: null,
        app: 'com.example',
      },
    ] satisfies api.HealthRecord[];
    const fetchSpy = vi.spyOn(api, 'fetchRecords').mockResolvedValue(records);

    const { result } = renderHook(() => useRecords('Steps', WINDOW), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(records);
    // The window is shaped by the single query builder, not hand-rolled here.
    expect(fetchSpy).toHaveBeenCalledWith(
      'Steps',
      buildTimeWindowQuery(WINDOW),
    );
  });

  it('changes the query key and refetches when the window changes', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchRecords').mockResolvedValue([]);
    const client = newClient();

    const { result, rerender } = renderHook(
      ({ w }: { w: TimeWindow }) => useRecords('Steps', w),
      { wrapper: wrapperFor(client), initialProps: { w: WINDOW } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const widerWindow: TimeWindow = {
      start: '2026-05-01T00:00:00.000Z',
      end: '2026-06-01T00:00:00.000Z',
    };
    rerender({ w: widerWindow });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy).toHaveBeenLastCalledWith(
      'Steps',
      buildTimeWindowQuery(widerWindow),
    );
  });

  it('surfaces a fetchRecords error through the error state', async () => {
    vi.spyOn(api, 'fetchRecords').mockRejectedValue(new api.AuthError());

    const { result } = renderHook(() => useRecords('Steps', WINDOW), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(api.AuthError);
  });
});

describe('useRecords integration (mocked global fetch)', () => {
  beforeEach(() => {
    setAuth({
      token: 'tok',
      refresh: 'ref',
      expiry: '2026-06-02T00:00:00Z',
      username: 'alice',
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('drives the real fetchRecords path over a 7-day window and returns records the sparkline can consume', async () => {
    // Real `api.fetchRecords` runs (mock is per-spy and restored each test);
    // only the network boundary is mocked.
    const payload: api.HealthRecord[] = [
      {
        _id: 'a',
        id: 'a',
        data: { count: 500 },
        start: '2026-05-26T10:00:00Z',
        end: null,
        app: 'com.example',
      },
      {
        _id: 'b',
        id: 'b',
        data: { count: 700 },
        start: '2026-05-27T10:00:00Z',
        end: null,
        app: 'com.example',
      },
    ];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRecords('Steps', WINDOW), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Casing → collection: "Steps" hit `/fetch/steps` with the allowlisted body.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/v2/fetch/steps');
    expect(JSON.parse(init.body as string)).toEqual({
      queries: buildTimeWindowQuery(WINDOW),
    });
    // Records the dashboard sparkline can map to {start, value}.
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].data.count).toBe(500);

    vi.unstubAllGlobals();
  });
});
